import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { codexRequestAllowed } from './codexBridge.ts';

const exists = async (path: string) => { try { await access(path); return true; } catch { return false; } };
function terminate(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null || child.killed) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill()); killer.unref();
  } else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }
}
type Emit = (event: { detail: string; phase: string }) => void;

export function createOmniRouteService(workspace: string, options: { port?: number; dataDirectory?: string; managedOnly?: boolean } = {}) {
  const port = options.port ?? 20128;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local OmniRoute port.');
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const root = resolve(workspace, '.ahpah-tools', 'omniroute');
  let child: ChildProcess | undefined;
  let installerChild: ChildProcess | undefined;
  let installing: Promise<void> | undefined;
  let starting: Promise<{ baseUrl: string; reused: boolean }> | undefined;
  async function running(signal: AbortSignal) {
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), redirect: 'error' });
      const healthData = health.ok ? await health.json().catch(() => null) as { status?: unknown } | null : null;
      if (healthData?.status === 'ok') return true;
      const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), redirect: 'error' });
      if (!response.ok) return false;
      const data = await response.json() as { data?: unknown };
      return Array.isArray(data?.data);
    } catch { signal.throwIfAborted(); return false; }
  }
  async function launcher() {
    const entries = [join(root, 'node_modules/omniroute/bin/omniroute.mjs'), resolve(dirname(process.execPath), '../lib/node_modules/omniroute/bin/omniroute.mjs'), ...(process.env.PATH || '').split(delimiter).filter(Boolean).map(directory => join(directory, 'node_modules/omniroute/bin/omniroute.mjs'))];
    if (process.env.APPDATA) entries.push(join(process.env.APPDATA, 'npm/node_modules/omniroute/bin/omniroute.mjs'));
    if (options.managedOnly) entries.splice(1);
    for (const entry of entries) if (await exists(entry)) return entry;
    return undefined;
  }
  async function install(signal: AbortSignal) {
    const candidates = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'), ...(process.env.PATH || '').split(delimiter).filter(Boolean).map(directory => join(directory, 'node_modules/npm/bin/npm-cli.js'))];
    let npm: string | undefined;
    for (const candidate of candidates) if (await exists(candidate)) { npm = candidate; break; }
    if (!npm) throw new Error('Node/npm could not be found. Install Node.js 24 or newer and restart the app.');
    await mkdir(root, { recursive: true });
    signal.throwIfAborted();
    await new Promise<void>((finish, reject) => {
      const installer = spawn(process.execPath, [npm!, 'install', '--prefix', root, '--no-audit', '--no-fund', 'omniroute@latest'], { windowsHide: true, stdio: 'ignore', detached: process.platform !== 'win32' });
      installerChild = installer;
      const stop = () => { terminate(installer); reject(new Error('OmniRoute installation stopped. Retry setup to continue.')); };
      signal.addEventListener('abort', stop, { once: true });
      const cleanup = () => { signal.removeEventListener('abort', stop); if (installerChild === installer) installerChild = undefined; };
      installer.on('error', () => { cleanup(); reject(new Error('OmniRoute installation stopped or failed. Check your internet connection and retry.')); });
      installer.on('exit', code => { cleanup(); if (code === 0) finish(); else reject(new Error('OmniRoute installation failed. Check your Node version and internet connection, then retry.')); });
    });
  }
  return {
    async start(signal: AbortSignal, emit: Emit) {
      if (starting) throw new Error('OmniRoute setup is already running. Wait for it to finish.');
      const operation = (async () => {
        emit({ phase: 'discovering', detail: 'Checking your local OmniRoute gateway…' });
        if (await running(signal)) return { baseUrl, reused: true };
        let entry = await launcher();
        if (!entry) {
          emit({ phase: 'installing', detail: 'Installing the latest official OmniRoute package. First setup may take a few minutes…' });
          if (!installing) installing = install(signal).finally(() => { installing = undefined; });
          await installing;
          signal.throwIfAborted();
          entry = await launcher();
          if (!entry) throw new Error('OmniRoute installed, but its launcher was not found. Retry setup.');
        }
        emit({ phase: 'starting', detail: `Starting OmniRoute on localhost:${port}…` });
        await mkdir(root, { recursive: true });
        if (!child || child.exitCode !== null || child.killed) {
          child = spawn(process.execPath, [entry, '--port', String(port), '--no-open', '--no-tray'], {
            cwd: root, windowsHide: true, stdio: 'ignore', detached: process.platform !== 'win32',
            env: { ...process.env, ...(options.dataDirectory ? { DATA_DIR: resolve(options.dataDirectory) } : {}),
              // Official OmniRoute compatibility setting for cold-start tool-less
              // dashboard checks. User-configured contracts remain authoritative.
              OPENCODE_FREE_TIER_PLACEHOLDER_TOOLS: process.env.OPENCODE_FREE_TIER_PLACEHOLDER_TOOLS || 'bash,read,glob,grep,edit,write',
              OMNIROUTE_SERVER_HOST: '127.0.0.1', HOSTNAME: '127.0.0.1', PORT: String(port), API_PORT: String(port), DASHBOARD_PORT: String(port) },
          });
          child.on('error', () => { /* Readiness polling reports a safe error without raw logs. */ });
        }
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          signal.throwIfAborted();
          if (await running(signal)) return { baseUrl, reused: false };
          if (child.exitCode !== null || child.killed || !child.pid) throw new Error(`OmniRoute could not start. Check whether port ${port} is already in use, then retry.`);
          await new Promise<void>(finish => { const timer = setTimeout(finish, 500); timer.unref(); });
        }
        throw new Error('OmniRoute is still starting. Wait a moment and retry; your installation has been kept.');
      })();
      starting = operation;
      try { return await operation; } finally { if (starting === operation) starting = undefined; }
    },
    close() { terminate(installerChild); terminate(child); },
  };
}

export function createOmniRouteMiddleware(service: Pick<ReturnType<typeof createOmniRouteService>, 'start'>, binding = () => true) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = (request.url || '').split('?')[0];
    if (!path.startsWith('/api/omniroute/')) { next(); return; }
    const json = (status: number, value: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
    if (!binding() || !codexRequestAllowed(request, true)) { json(403, { error: 'OmniRoute installation requires the local app and a same-origin request.' }); return; }
    if (path !== '/api/omniroute/start') { json(404, { error: 'Unknown OmniRoute setup route.' }); return; }
    if (request.method !== 'POST') { json(405, { error: 'Use POST to start OmniRoute setup.' }); return; }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5 * 60_000)]);
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', disconnect);
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' }); response.flushHeaders();
    const emit = (value: unknown) => { if (!response.destroyed) response.write(JSON.stringify(value) + '\n'); };
    const heartbeat = setInterval(() => emit({ phase: 'waiting' }), 10_000);
    try { emit({ result: await service.start(signal, emit) }); }
    catch (failure) { if (!controller.signal.aborted) emit({ error: failure instanceof Error ? failure.message : 'OmniRoute setup failed. Retry or open connection settings.' }); }
    finally { clearInterval(heartbeat); response.off('close', disconnect); if (!response.destroyed) response.end(); }
  };
}

export function omniRouteBridge(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    const service = createOmniRouteService(server.config.root);
    server.middlewares.use(createOmniRouteMiddleware(service, () => {
      const address = server.httpServer?.address();
      return !!address && typeof address !== 'string' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address.address);
    }));
    server.httpServer?.on('close', () => service.close());
  };
  return { name: 'ahpah-omniroute-bridge', configureServer: attach, configurePreviewServer: attach };
}
