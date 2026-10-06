import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { access } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { validLocalModelPullName, type LocalModelsProgress, type LocalModelsStatus } from '../src/utils/localModels.ts';

const OLLAMA_URL = 'http://127.0.0.1:11434';
const MAX_STATUS_BYTES = 1024 * 1024;
const MAX_PULL_BYTES = 32 * 1024 ** 3;
const noModelsMessage = 'Ollama is running, but no downloaded local models are installed. Choose a model from ollama.com/library and download it to begin.';
const unavailableMessage = 'Ollama is not running on this computer. Use Set up local AI to start it, or install Ollama from ollama.com/download.';
type Emit = (event: LocalModelsProgress) => void;
type Launch = (file: string, args: string[], options: SpawnOptions) => ChildProcess;
interface LocalModelsRuntime {
  find(): Promise<string | undefined>;
  install(signal: AbortSignal): Promise<void>;
  start(executable: string): Promise<void>;
  close(): void;
}

const exists = async (path: string) => { try { await access(path); return true; } catch { return false; } };
function terminate(child: ChildProcess | undefined, platform: NodeJS.Platform, launch: Launch) {
  if (!child?.pid || child.exitCode !== null || child.killed) return;
  if (platform === 'win32') {
    // Fixed arguments and no shell; the installer can create child processes.
    const killer = launch('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill()); killer.unref();
  } else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }
}

/** Uses the official Ollama package through Microsoft's checksum-verifying WinGet source. */
export function createOllamaRuntime(options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; exists?: typeof exists; launch?: Launch; installTimeoutMs?: number } = {}): LocalModelsRuntime {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const accessible = options.exists ?? exists;
  const launch = options.launch ?? ((file, args, spawnOptions) => spawn(file, args, spawnOptions));
  let installer: ChildProcess | undefined;
  let managed: ChildProcess | undefined;
  async function findExecutable(name: string, preferred: string[] = []) {
    const paths = [...preferred, ...(env.PATH || '').split(delimiter).filter(isAbsolute).map(directory => join(directory, name))];
    for (const path of new Set(paths)) if (await accessible(path)) return path;
    return undefined;
  }
  return {
    async find() {
      return findExecutable(platform === 'win32' ? 'ollama.exe' : 'ollama', platform === 'win32' && env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')] : platform === 'darwin' ? ['/Applications/Ollama.app/Contents/Resources/ollama', '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama'] : ['/usr/local/bin/ollama', '/usr/bin/ollama']);
    },
    async install(signal) {
      signal.throwIfAborted();
      if (platform !== 'win32') throw new Error('Install the official Ollama runtime from ollama.com/download, then use Set up local AI again. Automatic runtime installation is available on Windows.');
      const winget = await findExecutable('winget.exe', env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe')] : []);
      if (!winget) throw new Error('Windows App Installer (WinGet) was not found. Install Ollama from ollama.com/download/windows, then use Set up local AI again.');
      signal.throwIfAborted();
      const installSignal = AbortSignal.any([signal, AbortSignal.timeout(options.installTimeoutMs ?? 8 * 60_000)]);
      await new Promise<void>((resolve, reject) => {
        const child = launch(winget, ['install', '--id', 'Ollama.Ollama', '--exact', '--source', 'winget', '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--no-upgrade'], { windowsHide: true, stdio: 'ignore', shell: false });
        installer = child;
        const cleanup = () => { installSignal.removeEventListener('abort', cancel); if (installer === child) installer = undefined; };
        const cancel = () => { terminate(child, platform, launch); cleanup(); reject(installSignal.reason); };
        installSignal.addEventListener('abort', cancel, { once: true });
        child.once('error', () => { cleanup(); reject(new Error('Ollama installation could not start. Install it from ollama.com/download/windows and retry.')); });
        child.once('exit', code => { cleanup(); if (code === 0) resolve(); else reject(new Error('Ollama installation did not complete. Check your internet connection and available disk space, then retry setup.')); });
        if (installSignal.aborted) cancel();
      });
    },
    async start(executable) {
      if (managed && managed.exitCode === null && !managed.killed) return;
      const child = launch(executable, ['serve'], { windowsHide: true, stdio: 'ignore', shell: false, detached: platform !== 'win32', env: { ...env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1' } });
      managed = child;
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', () => { if (managed === child) managed = undefined; reject(new Error('Ollama could not start. Open the Ollama app, then retry setup.')); });
      });
    },
    close() { terminate(installer, platform, launch); terminate(managed, platform, launch); installer = undefined; managed = undefined; },
  };
}

async function boundedText(response: Response, signal: AbortSignal, maximum: number) {
  if (!response.body) throw new Error('Ollama returned an empty response.');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let text = ''; let bytes = 0;
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read(); signal.throwIfAborted();
      if (value) bytes += value.byteLength;
      if (bytes > maximum) throw new Error('Ollama returned oversized model data.');
      text += decoder.decode(value, { stream: !done });
      if (done) return text;
    }
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createLocalModelsService(options: { runtime?: LocalModelsRuntime; fetch?: typeof fetch; requestTimeoutMs?: number; startupTimeoutMs?: number; pullTimeoutMs?: number; maxPullBytes?: number } = {}) {
  const runtime = options.runtime ?? createOllamaRuntime();
  const request = options.fetch ?? globalThis.fetch;
  let active: AbortController | undefined;
  async function json(path: '/api/tags' | '/api/version', signal: AbortSignal) {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(options.requestTimeoutMs ?? 2500)]);
    const response = await request(OLLAMA_URL + path, { signal: boundedSignal, redirect: 'error', credentials: 'omit' });
    if (!response.ok) throw new Error('Ollama returned an unsuccessful response.');
    return JSON.parse(await boundedText(response, boundedSignal, MAX_STATUS_BYTES)) as Record<string, unknown>;
  }
  async function discover(signal = new AbortController().signal): Promise<LocalModelsStatus> {
    signal.throwIfAborted();
    try {
      const [tags, version] = await Promise.all([json('/api/tags', signal), json('/api/version', signal)]);
      if (!Array.isArray(tags.models) || tags.models.length > 1000 || typeof version.version !== 'string' || !/^\d+\.\d+\.\d+[a-z0-9.+-]*$/i.test(version.version) || version.version.length > 64) throw new Error('The service on port 11434 did not return an Ollama model list and version.');
      const models = tags.models.flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const model = value as Record<string, unknown>;
        const id = typeof model.model === 'string' ? model.model : model.name;
        // Remote entries can appear in /api/tags; they have provider limits and are not local models.
        if (model.remote_host || model.remote_model || typeof id !== 'string' || id.length > 256 || !/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9][a-z0-9._-]*)?$/i.test(id) || /(?:^|[._-])cloud(?:$|[._-])/i.test(id.split(':')[1] || '') || typeof model.size !== 'number' || !Number.isSafeInteger(model.size) || model.size <= 0) return [];
        const capabilities = Array.isArray(model.capabilities) ? model.capabilities.filter((capability): capability is string => typeof capability === 'string' && /^[a-z0-9_-]{1,64}$/i.test(capability)).slice(0, 32) : undefined;
        return [{ id, name: id, size: model.size, isLocal: true, ...(capabilities ? { capabilities } : {}) }];
      });
      const unique = [...new Map(models.map(model => [model.id, model])).values()].sort((left, right) => left.name.localeCompare(right.name));
      return { available: true, version: version.version, models: unique, ...(!unique.length ? { error: noModelsMessage } : {}) };
    } catch (error) {
      signal.throwIfAborted();
      return { available: false, models: [], error: error instanceof Error && /did not return an Ollama/.test(error.message) ? error.message : unavailableMessage };
    }
  }
  async function pull(model: string, signal: AbortSignal, emit: Emit) {
    const pullSignal = AbortSignal.any([signal, AbortSignal.timeout(options.pullTimeoutMs ?? 30 * 60_000)]);
    const response = await request(OLLAMA_URL + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }), signal: pullSignal, redirect: 'error', credentials: 'omit' });
    if (!response.ok || !response.body) throw new Error('Ollama could not download that model. Check the exact name at ollama.com/library and your internet connection.');
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    let buffer = ''; let bytes = 0; let success = false; let lastEmit = 0;
    const layers = new Map<string, number>();
    const parse = (line: string) => {
      if (!line.trim()) return;
      const value = JSON.parse(line) as Record<string, unknown>;
      if (!value || typeof value !== 'object') throw new Error('Ollama returned invalid download progress.');
      if (value.error) throw new Error('Ollama could not download that model. Check the exact name at ollama.com/library, disk space, and your internet connection.');
      if (typeof value.status !== 'string') throw new Error('Ollama returned invalid download progress.');
      const total = typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total > 0 ? value.total : undefined;
      const completed = typeof value.completed === 'number' && Number.isSafeInteger(value.completed) && value.completed >= 0 ? value.completed : undefined;
      const firstLayer = total !== undefined && typeof value.digest === 'string' && !layers.has(value.digest);
      if (total !== undefined) {
        if (typeof value.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(value.digest)) throw new Error('Ollama returned invalid download size data.');
        layers.set(value.digest, Math.max(total, layers.get(value.digest) || 0));
        if (layers.size > 1000 || [...layers.values()].reduce((sum, size) => sum + size, 0) > (options.maxPullBytes ?? MAX_PULL_BYTES)) throw new Error('That model exceeds the 32 GB local download safety limit. Choose a smaller model from ollama.com/library.');
      }
      if (value.status === 'success') success = true;
      if (firstLayer || completed === undefined || Date.now() - lastEmit > 150 || success || completed === total) {
        const detail = Array.from(value.status.slice(0, 300), character => character.charCodeAt(0) < 32 ? ' ' : character).join('');
        emit({ phase: 'downloading', detail, ...(total !== undefined ? { total } : {}), ...(completed !== undefined ? { completed } : {}), ...(completed !== undefined && total !== undefined ? { percent: Math.min(100, Math.round(completed / total * 100)) } : {}) });
        lastEmit = Date.now();
      }
    };
    const cancel = () => { void reader.cancel(pullSignal.reason).catch(() => {}); };
    pullSignal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        pullSignal.throwIfAborted();
        const { value, done } = await reader.read(); pullSignal.throwIfAborted();
        if (value) bytes += value.byteLength;
        if (bytes > 8 * 1024 * 1024) throw new Error('Ollama returned too much download progress. Retry to resume your download.');
        buffer += decoder.decode(value, { stream: !done });
        let index: number;
        while ((index = buffer.indexOf('\n')) >= 0) { if (index > 16_384) throw new Error('Ollama returned oversized download progress.'); parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); }
        if (buffer.length > 16_384) throw new Error('Ollama returned oversized download progress.');
        if (done) { parse(buffer); break; }
      }
      if (!success) throw new Error('The model download ended before Ollama confirmed success. Retry to resume it.');
    } finally { pullSignal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  return {
    discover,
    async setup(input: { model?: string }, signal: AbortSignal, emit: Emit): Promise<LocalModelsStatus> {
      signal.throwIfAborted();
      if (input.model !== undefined && !validLocalModelPullName(input.model)) throw new Error('Use a local model name from ollama.com/library. Cloud models, paths, and URLs are not supported.');
      if (active) throw new Error('Local AI setup is already running. Wait for it to finish or cancel it first.');
      const controller = new AbortController(); active = controller;
      const operationSignal = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(35 * 60_000)]);
      try {
        emit({ phase: 'discovering', detail: 'Checking Ollama and your installed local models…' });
        let status = await discover(operationSignal);
        if (!status.available) {
          let executable = await runtime.find();
          if (!executable) {
            emit({ phase: 'installing', detail: 'Installing official Ollama with Windows App Installer. The runtime needs at least 4 GB of disk space; model downloads are separate.' });
            await runtime.install(operationSignal);
            operationSignal.throwIfAborted();
            executable = await runtime.find();
            if (!executable) throw new Error('Ollama installed, but its launcher could not be found. Restart the local app and retry setup.');
          }
          // The Windows installer can start its existing tray service. Check again before launching.
          status = await discover(operationSignal);
          if (!status.available) {
            emit({ phase: 'starting', detail: 'Starting Ollama on this computer…' });
            await runtime.start(executable);
            const deadline = Date.now() + (options.startupTimeoutMs ?? 30_000);
            do {
              status = await discover(operationSignal);
              if (status.available) break;
              await delay(300, undefined, { signal: operationSignal });
            } while (Date.now() < deadline);
            if (!status.available) throw new Error('Ollama did not become ready on port 11434. Open the Ollama app and retry; check that the port is not used by another program.');
          }
        }
        if (input.model) {
          const requested = input.model.includes(':') ? input.model : `${input.model}:latest`;
          if (!status.models.some(model => model.id === requested || model.id === input.model)) {
            emit({ phase: 'downloading', detail: `Downloading ${input.model}. Keep the app open; cancel anytime and retry to resume.` });
            await pull(input.model, operationSignal, emit);
            status = await discover(operationSignal);
            if (!status.available || !status.models.some(model => model.id === requested || model.id === input.model)) throw new Error('Ollama finished the download, but the model is not in its installed local inventory. Refresh the model list and retry.');
          }
        }
        emit({ phase: status.models.length ? 'ready' : 'no-models', detail: status.models.length ? `${status.models.length} installed local model${status.models.length === 1 ? '' : 's'} available. Local generation has no provider usage quota; speed depends on this computer.` : noModelsMessage });
        return status;
      } catch (error) {
        operationSignal.throwIfAborted();
        if (error instanceof Error && error.name === 'TimeoutError') throw new Error('Local AI setup timed out. Retry to resume setup or the model download.');
        throw error;
      } finally { if (active === controller) active = undefined; }
    },
    close() { active?.abort(); runtime.close(); },
  };
}

function localRequestAllowed(request: IncomingMessage, mutation: boolean) {
  const loopback = (address = '') => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  if (!loopback(request.socket.localAddress) || !loopback(request.socket.remoteAddress) || request.headers['sec-fetch-site'] === 'cross-site') return false;
  try {
    const protocol = 'encrypted' in request.socket && request.socket.encrypted ? 'https:' : 'http:';
    const host = new URL(`${protocol}//${request.headers.host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname) || host.username || host.password) return false;
    const origin = request.headers.origin;
    return origin ? origin === host.origin : !mutation;
  } catch { return false; }
}

async function setupBody(request: IncomingMessage, signal: AbortSignal) {
  if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) throw new Error('Use an application/json setup request.');
  if (Number(request.headers['content-length'] || 0) > 1024) throw new Error('Local AI setup request is too large.');
  const chunks: Buffer[] = []; let bytes = 0;
  const cancel = () => request.destroy();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for await (const value of request) {
      signal.throwIfAborted();
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      bytes += chunk.length;
      if (bytes > 1024) throw new Error('Local AI setup request is too large.');
      chunks.push(chunk);
    }
  } finally { signal.removeEventListener('abort', cancel); }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => key !== 'model')) throw new Error('Local AI setup accepts only an optional model name.');
  const input = data as { model?: unknown };
  if (input.model !== undefined && !validLocalModelPullName(input.model)) throw new Error('Use a local model name from ollama.com/library. Cloud models, paths, and URLs are not supported.');
  return input as { model?: string };
}

export function createLocalModelsMiddleware(service: Pick<ReturnType<typeof createLocalModelsService>, 'discover' | 'setup'>, binding = () => true) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = (request.url || '').split('?')[0];
    if (!path.startsWith('/api/local-models/')) { next(); return; }
    const json = (status: number, value: unknown) => { if (!response.destroyed) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); } };
    if (!binding() || !localRequestAllowed(request, request.method !== 'GET')) { json(403, { available: false, models: [], error: 'Local AI requires this app on a loopback-only server and a same-origin request.' }); return; }
    if (path !== '/api/local-models/status' && path !== '/api/local-models/setup') { json(404, { error: 'Unknown local AI route.' }); return; }
    if (request.method !== (path.endsWith('/status') ? 'GET' : 'POST')) { json(405, { error: path.endsWith('/status') ? 'Use GET to discover local models.' : 'Use POST to set up local AI.' }); return; }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(path.endsWith('/status') ? 8000 : 35 * 60_000)]);
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', disconnect);
    if (path.endsWith('/status')) {
      try { json(200, await service.discover(signal)); }
      catch { if (!controller.signal.aborted) json(503, { available: false, models: [], error: 'Local AI discovery timed out. Retry or open the Ollama app.' }); }
      finally { response.off('close', disconnect); }
      return;
    }
    let input: { model?: string };
    try { input = await setupBody(request, AbortSignal.any([signal, AbortSignal.timeout(5000)])); }
    catch (error) { json(400, { error: error instanceof Error && error.name !== 'SyntaxError' ? error.message : 'Local AI setup request must be valid JSON.' }); response.off('close', disconnect); return; }
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.flushHeaders();
    let overflow = false;
    const emit = (value: unknown) => {
      if (response.destroyed || controller.signal.aborted) return;
      if (response.writableLength > MAX_STATUS_BYTES) { overflow = true; controller.abort(); response.destroy(); return; }
      response.write(JSON.stringify(value) + '\n');
    };
    const heartbeat = setInterval(() => emit({ phase: 'waiting' }), 10_000);
    try { emit({ result: await service.setup(input, signal, emit) }); }
    catch (error) { if (!controller.signal.aborted && !overflow) emit({ error: error instanceof Error && error.name !== 'AbortError' && error.name !== 'TimeoutError' ? error.message.slice(0, 600) : 'Local AI setup timed out. Retry to resume your download.' }); }
    finally { clearInterval(heartbeat); response.off('close', disconnect); if (!response.destroyed) response.end(); }
  };
}

export function localModelsBridge(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    const service = createLocalModelsService();
    server.middlewares.use(createLocalModelsMiddleware(service, () => {
      const address = server.httpServer?.address();
      return !!address && typeof address !== 'string' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address.address);
    }));
    server.httpServer?.on('close', () => service.close());
  };
  return { name: 'ahpah-local-models-bridge', configureServer: attach, configurePreviewServer: attach };
}
