import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

type Launcher = { file: string; args: string[] };
type Message = { id?: number; method?: string; result?: any; error?: { message: string }; params?: any };
const exists = async (path: string) => { try { await access(path); return true; } catch { return false; } };
const loopback = (value = "") => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(value);
async function removeTemporaryDirectory(directory: string) {
  if (dirname(resolve(directory)) === resolve(tmpdir()) && directory.startsWith(join(tmpdir(), "ahpah-codex-"))) await rm(directory, { recursive: true, force: true }).catch(() => {});
}
export function codexRequestAllowed(request: IncomingMessage, mutation: boolean): boolean {
  if (!loopback(request.socket.localAddress) || !loopback(request.socket.remoteAddress) || request.headers["sec-fetch-site"] === "cross-site") return false;
  try {
    const host = new URL(`http://${request.headers.host}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host.hostname)) return false;
    const origin = request.headers.origin;
    if (!origin) return !mutation;
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === host.host && !url.username && !url.password;
  } catch { return false; }
}

class Rpc {
  child: ChildProcessWithoutNullStreams;
  nextId = 0;
  pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  ready: Promise<void>;
  loginId?: string;
  loginError?: string;
  constructor(launcher: Launcher, cwd: string) {
    this.child = spawn(launcher.file, [...launcher.args, "app-server", "--listen", "stdio://"], { cwd, windowsHide: true, stdio: "pipe" });
    // Never relay stderr: authentication and configuration diagnostics can contain secrets.
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on("line", line => {
      try {
        const message: Message = JSON.parse(line);
        if (message.id !== undefined && message.method) {
          this.child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: "This client does not execute Codex tools." } }) + "\n");
        } else if (message.id !== undefined) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.error) pending.reject(new Error("Codex could not complete the request. Check your sign-in or update Codex."));
          else pending.resolve(message.result);
        } else if (message.method === "account/login/completed") {
          this.loginId = undefined;
          this.loginError = message.params?.success ? undefined : "Sign-in was cancelled or failed. Connect again.";
        }
      } catch { /* Ignore non-protocol output. */ }
    });
    const fail = () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Codex stopped. Update or reinstall Codex and connect again.")); }
      this.pending.clear();
    };
    this.child.on("error", fail); this.child.on("exit", fail);
    this.child.stdin.on("error", fail);
    this.child.on("close", () => { void removeTemporaryDirectory(cwd); });
    this.ready = this.call("initialize", { clientInfo: { name: "ahpah_canvas", title: "AhPah Canvas", version: "0.1.0" } }).then(() => {
      this.child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
    });
  }
  call(method: string, params: unknown): Promise<any> {
    return new Promise((resolveResult, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Codex did not respond. Try connecting again.")); }, 30_000);
      this.pending.set(id, { resolve: resolveResult, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  close() { this.child.kill(); }
}

export function createCodexService(workspace: string) {
  let rpc: Rpc | undefined;
  let starting: Promise<Rpc> | undefined;
  let installing: Promise<void> | undefined;
  const toolsRoot = resolve(workspace, ".ahpah-tools");
  const packageEntry = join(toolsRoot, "node_modules/@openai/codex/bin/codex.js");
  async function launcher(): Promise<Launcher | undefined> {
    if (await exists(packageEntry)) return { file: process.execPath, args: [packageEntry] };
    const directories = (process.env.PATH || "").split(delimiter);
    if (process.platform === "win32" && process.env.LOCALAPPDATA) directories.push(join(process.env.LOCALAPPDATA, "Programs/OpenAI/Codex/bin"));
    for (const directory of directories) {
      if (!directory) continue;
      const executable = join(directory, process.platform === "win32" ? "codex.exe" : "codex");
      if (await exists(executable)) return { file: executable, args: [] };
      const entry = join(directory, "node_modules/@openai/codex/bin/codex.js");
      if (await exists(entry)) return { file: process.execPath, args: [entry] };
    }
    return undefined;
  }
  async function install() {
    const candidates = [join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"), ...(process.env.PATH || "").split(delimiter).map(dir => join(dir, "node_modules/npm/bin/npm-cli.js"))];
    let npm: string | undefined;
    for (const candidate of candidates) if (await exists(candidate)) { npm = candidate; break; }
    if (!npm) throw new Error("Install Codex with npm install -g @openai/codex, then connect again.");
    await mkdir(toolsRoot, { recursive: true });
    await new Promise<void>((finish, reject) => {
      const child = spawn(process.execPath, [npm!, "install", "--prefix", toolsRoot, "--no-audit", "--no-fund", "@openai/codex@latest"], { windowsHide: true, stdio: "ignore" });
      const timer = setTimeout(() => { child.kill(); reject(new Error("Codex installation timed out. Check your connection and retry.")); }, 120_000);
      child.on("error", () => { clearTimeout(timer); reject(new Error("Could not install Codex. Install npm install -g @openai/codex and retry.")); });
      child.on("exit", code => { clearTimeout(timer); if (code === 0) finish(); else reject(new Error("Codex installation failed. Check your connection and retry.")); });
    });
  }
  async function getRpc() {
    if (rpc && rpc.child.exitCode === null && !rpc.child.killed) return rpc;
    if (!starting) starting = (async () => {
      const executable = await launcher();
      if (!executable) throw new Error("Codex is not installed. Click Connect to install the official Codex CLI.");
      const cwd = await mkdtemp(join(tmpdir(), "ahpah-codex-"));
      const next = new Rpc(executable, cwd);
      try { await next.ready; rpc = next; return next; } catch (error) { next.close(); throw error; }
    })().finally(() => { starting = undefined; });
    return starting;
  }
  async function status() {
    if (!await launcher()) return { installed: false, connected: false, models: [] };
    const client = await getRpc();
    const result = await client.call("account/read", { refreshToken: false });
    const connected = result.account?.type === "chatgpt";
    const models: { id: string; name: string; isDefault: boolean }[] = [];
    if (connected) {
      let cursor: string | null = null;
      for (let page = 0; page < 10; page++) {
        const catalog = await client.call("model/list", { limit: 100, includeHidden: false, cursor });
        for (const item of catalog.data || []) models.push({ id: item.model || item.id, name: item.displayName || item.model || item.id, isDefault: !!item.isDefault });
        cursor = catalog.nextCursor;
        if (!cursor) break;
      }
    }
    return { installed: true, connected, plan: connected ? result.account.planType : undefined, models, pending: !!client.loginId, error: client.loginError };
  }
  return {
    status,
    async connect() {
      if (!await launcher()) {
        installing ??= install().finally(() => { installing = undefined; });
        await installing;
      }
      const current = await status();
      if (current.connected) return current;
      const client = await getRpc();
      if (client.loginId) return { ...current, pending: true };
      const login = await client.call("account/login/start", { type: "chatgpt" });
      const url = new URL(login.authUrl);
      if (url.protocol !== "https:" || url.hostname !== "auth.openai.com") throw new Error("Codex returned an unexpected sign-in URL. Update Codex and retry.");
      client.loginId = login.loginId; client.loginError = undefined;
      return { ...current, pending: true, authUrl: url.href };
    },
    async cancelLogin() {
      if (rpc?.loginId) await rpc.call("account/login/cancel", { loginId: rpc.loginId });
      return { cancelled: true };
    },
    async complete(body: { model?: unknown; messages?: unknown }, signal: AbortSignal, emit: (value: unknown) => void) {
      const current = await status();
      if (!current.connected) throw new Error("Connect Codex with ChatGPT in Settings first.");
      if (typeof body.model !== "string" || !current.models.some(model => model.id === body.model)) throw new Error("Select a current Codex model in Settings.");
      if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100 || body.messages.some(message => !message || !["user", "assistant", "system"].includes(message.role) || typeof message.content !== "string")) throw new Error("Invalid Codex conversation.");
      const executable = (await launcher())!;
      const cwd = await mkdtemp(join(tmpdir(), "ahpah-codex-run-"));
      const input = "You are the model for AhPah Canvas. Return the requested response or JSON action envelope. All project tools are executed by the host from your JSON; do not use native tools or inspect this computer.\n" + body.messages.map(message => `[${message.role}]\n${message.content}`).join("\n\n");
      await new Promise<void>((finish, reject) => {
        signal.throwIfAborted();
        const child = spawn(executable.file, [...executable.args, "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--disable", "shell_tool", "--disable", "apps", "--disable", "multi_agent", "-c", 'approval_policy="never"', "--model", body.model as string, "--json", "-"], { cwd, windowsHide: true, stdio: "pipe" });
        let finalText = ""; let tokens = 0; let failed = false; let outputBytes = 0; let settled = false;
        const stop = () => { child.kill(); done(signal.reason instanceof Error ? signal.reason : new Error("Codex request cancelled.")); };
        const timer = setTimeout(() => { child.kill(); done(new Error("Codex did not finish within 10 minutes. Try a smaller task.")); }, 600_000);
        const done = (error?: Error) => {
          if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener("abort", stop);
          if (error) reject(error); else finish();
        };
        signal.addEventListener("abort", stop, { once: true });
        child.stderr.resume();
        createInterface({ input: child.stdout }).on("line", line => {
          outputBytes += Buffer.byteLength(line);
          if (outputBytes > 2_000_000) { child.kill(); done(new Error("Codex response exceeded the output limit.")); return; }
          try {
            const event = JSON.parse(line);
            if (event.type === "item.completed" && event.item?.type === "agent_message") { finalText = event.item.text || ""; emit({ text: finalText, phase: "answer", model: body.model }); }
            if (event.type === "turn.completed") tokens = (event.usage?.input_tokens || 0) + (event.usage?.output_tokens || 0);
            if (["error", "turn.failed"].includes(event.type)) failed = true;
          } catch { /* No raw diagnostics reach the browser. */ }
        });
        child.on("error", () => done(new Error("Could not start Codex. Update Codex and reconnect.")));
        child.on("close", () => { void removeTemporaryDirectory(cwd); });
        child.on("exit", code => {
          if (settled) return;
          if (code !== 0 || failed || !finalText.trim()) { done(new Error("Codex could not complete this turn. Check your ChatGPT sign-in, plan limits, and selected model.")); return; }
          emit({ result: { text: finalText, model: body.model, tokens } }); done();
        });
        child.stdin.on("error", () => {});
        child.stdin.end(input);
      });
    },
    close() { rpc?.close(); },
  };
}

export function createCodexMiddleware(service: ReturnType<typeof createCodexService>, binding: () => boolean = () => true) {
  let active = 0;
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = (request.url || "").split("?")[0];
    if (!path.startsWith("/api/codex/")) { next(); return; }
    const json = (status: number, value: unknown) => { if (!response.destroyed) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); } };
    if (!binding() || !codexRequestAllowed(request, request.method !== "GET")) { json(403, { error: "Codex requires the local app and a same-origin request." }); return; }
    const routes: Record<string, string> = { "/api/codex/status": "GET", "/api/codex/connect": "POST", "/api/codex/cancel": "POST", "/api/codex/complete": "POST" };
    if (!routes[path]) { json(404, { error: "Unknown Codex route." }); return; }
    if (request.method !== routes[path]) { json(405, { error: "Unsupported method." }); return; }
    const controller = new AbortController();
    const disconnect = () => { if (!response.writableEnded) controller.abort(new Error("Browser disconnected.")); };
    response.on("close", disconnect);
    try {
      if (path.endsWith("/status")) json(200, await service.status());
      else if (path.endsWith("/connect")) json(200, await service.connect());
      else if (path.endsWith("/cancel")) json(200, await service.cancelLogin());
      else {
        if (active >= 2) { json(429, { error: "Two Codex turns are already running. Stop or finish one before starting another." }); return; }
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > 700_000) { json(413, { error: "Codex context is too large." }); return; } chunks.push(Buffer.from(chunk)); }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { json(400, { error: "Invalid Codex request JSON." }); return; }
        if (!body || typeof body !== "object") { json(400, { error: "Invalid Codex request." }); return; }
        if (active >= 2) { json(429, { error: "Two Codex turns are already running. Stop or finish one before starting another." }); return; }
        response.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" }); response.flushHeaders();
        const emit = (value: unknown) => { if (!response.destroyed) response.write(JSON.stringify(value) + "\n"); };
        const heartbeat = setInterval(() => emit({ phase: "waiting", text: "" }), 15_000);
        active++;
        try { await service.complete(body, controller.signal, emit); }
        finally { active--; clearInterval(heartbeat); }
        if (!response.destroyed) response.end();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Codex connection failed.";
      if (response.headersSent) { if (!response.destroyed) response.end(JSON.stringify({ error: message }) + "\n"); }
      else json(502, { error: message });
    } finally { response.off("close", disconnect); }
  };
}

export function codexBridge(): Plugin {
  return {
    name: "ahpah-codex-bridge",
    configureServer(server) {
      const service = createCodexService(server.config.root);
      server.middlewares.use(createCodexMiddleware(service, () => { const address = server.httpServer?.address(); return !!address && typeof address !== "string" && loopback(address.address); }));
      server.httpServer?.on("close", () => service.close());
    },
    configurePreviewServer(server) {
      const service = createCodexService(server.config.root);
      server.middlewares.use(createCodexMiddleware(service, () => { const address = server.httpServer.address(); return !!address && typeof address !== "string" && loopback(address.address); }));
      server.httpServer.on("close", () => service.close());
    },
  };
}
