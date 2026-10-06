import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, readdir, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

const FILE_BYTES = 256 * 1024;
const PROJECT_BYTES = 2 * 1024 * 1024;
const FILE_COUNT = 200;
const OUTPUT_BYTES = 256_000;
const COMMANDS = ["npm install", "npm ci", "npm run <script>", "node <file>", "node --check <file>"];
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "build", "coverage", ".git", ".next", ".cache", ".aws", ".ssh", "__macosx"]);

export interface ProjectBridgeOptions {
  workspaceRoot?: string;
  timeoutMs?: number;
  isLoopbackBinding?: () => boolean;
}

interface ProjectFile { path: string; content: string }
interface ProjectRun { projectId?: string; files: ProjectFile[]; command: string }

class ProjectError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function isLoopback(address: string | undefined): boolean {
  return !!address && (address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1");
}

function localRequest(request: IncomingMessage, requireOrigin: boolean): boolean {
  if (!isLoopback(request.socket.remoteAddress) || !isLoopback(request.socket.localAddress)) return false;
  try {
    const host = new URL(`http://${request.headers.host || ""}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host.hostname)) return false;
    if (request.headers["sec-fetch-site"] === "cross-site") return false;
    if (!request.headers.origin) return !requireOrigin;
    const origin = new URL(request.headers.origin);
    return ["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password && origin.host === host.host;
  } catch { return false; }
}

export function normalizeProjectPath(value: unknown, generated = false): string {
  if (typeof value !== "string" || !value || value.length > 240 || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new ProjectError(400, "Project file paths must be short, relative text paths.");
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (isAbsolute(normalized) || normalized.startsWith("/") || parts.some((part) =>
    !part || part === "." || part === ".." || /[:*?"<>|]/.test(part) || /[. ]$/.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || part.toLowerCase().startsWith(".ahpah") ||
    (!generated && SKIP_DIRECTORIES.has(part.toLowerCase()))))
    throw new ProjectError(400, "Use project-relative paths without traversal, reserved names, or generated dependency folders.");
  const leaf = parts.at(-1)!.toLowerCase();
  if (/^\.env(?:\.|$)/.test(leaf) || [".npmrc", ".yarnrc", ".yarnrc.yml", ".netrc", ".git-credentials", ".pypirc", "id_rsa", "id_ed25519", "credentials", "credentials.json"].includes(leaf) || /\.(pem|key|p12|pfx)$/.test(leaf))
    throw new ProjectError(400, "Secrets and private credential files cannot be sent to the project runner.");
  return normalized;
}

function inside(root: string, path: string): boolean {
  const difference = relative(root, path);
  return !difference || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference));
}

async function checkedPath(root: string, path: string, createParents = false, generated = false): Promise<string> {
  const parts = normalizeProjectPath(path, generated).split("/");
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    if (!inside(root, current)) throw new ProjectError(400, "File path leaves the project folder.");
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || (metadata.isFile() && metadata.nlink > 1) || !inside(root, await realpath(current)))
        throw new ProjectError(400, "Linked project files are not supported.");
      if (i < parts.length - 1 && !metadata.isDirectory()) throw new ProjectError(400, "A project path contains a non-folder component.");
      if (i === parts.length - 1 && !metadata.isFile()) throw new ProjectError(400, "Project files must be regular files.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (i < parts.length - 1 && createParents) await mkdir(current);
    }
  }
  return current;
}

function parseRun(body: unknown): ProjectRun {
  if (!body || typeof body !== "object") throw new ProjectError(400, "Invalid project request.");
  const request = body as Record<string, unknown>;
  if (request.projectId !== undefined && (typeof request.projectId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(request.projectId)))
    throw new ProjectError(400, "Invalid project ID.");
  if (!Array.isArray(request.files) || !request.files.length || request.files.length > FILE_COUNT)
    throw new ProjectError(400, `Provide between 1 and ${FILE_COUNT} project files.`);
  let total = 0;
  const paths = new Set<string>();
  const files = request.files.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new ProjectError(400, "Invalid project file.");
    const file = value as Record<string, unknown>;
    const path = normalizeProjectPath(file.path);
    if (paths.has(path.toLowerCase())) throw new ProjectError(400, "Project file paths must be unique.");
    paths.add(path.toLowerCase());
    if (typeof file.content !== "string" || file.content.includes("\0")) throw new ProjectError(400, "Project files must contain text.");
    const size = Buffer.byteLength(file.content);
    total += size;
    if (size > FILE_BYTES || total > PROJECT_BYTES) throw new ProjectError(413, "Project exceeds the text file size limit.");
    return { path, content: file.content };
  });
  if (typeof request.command !== "string" || request.command.length > 300) throw new ProjectError(400, "Choose a supported project command.");
  return { projectId: request.projectId as string | undefined, files, command: request.command.trim() };
}

export function parseProjectCommand(command: string): { kind: "node" | "npm"; args: string[] } {
  if (/^npm (install|ci)$/.test(command)) return { kind: "npm", args: [command.slice(4)] };
  const script = command.match(/^npm run ([a-zA-Z0-9][a-zA-Z0-9:_-]{0,79})$/);
  if (script) return { kind: "npm", args: ["run", script[1]] };
  const node = command.match(/^node (--check )?(?:("[^"\r\n]+")|('[^'\r\n]+')|([^\s'";|&<>`]+))$/);
  if (node) {
    const file = normalizeProjectPath((node[2] || node[3] || node[4]).replace(/^['"]|['"]$/g, ""));
    if (file.startsWith("-")) throw new ProjectError(400, "Node file paths cannot be command-line flags.");
    if (!/\.(?:[cm]?[jt]s)$/.test(file)) throw new ProjectError(400, "Node commands require a JavaScript or TypeScript project file.");
    return { kind: "node", args: node[1] ? ["--check", file] : [file] };
  }
  throw new ProjectError(400, "Supported commands: npm install, npm ci, npm run <script>, node <relative file>, or node --check <relative file>. Shell operators and additional flags are not supported.");
}

async function findNpm(): Promise<string | undefined> {
  const candidates = [
    join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
    process.env.npm_execpath,
    ...(process.env.PATH || "").split(sep === "\\" ? ";" : ":").flatMap((directory) => directory ? [join(directory, "node_modules/npm/bin/npm-cli.js")] : []),
  ];
  for (const candidate of candidates) {
    if (!candidate || !candidate.endsWith("npm-cli.js")) continue;
    try { await access(candidate, constants.R_OK); return candidate; } catch { /* Try the next installation. */ }
  }
  return undefined;
}

async function projectFolder(workspace: string, projectId: string): Promise<string> {
  const workspaceReal = await realpath(workspace);
  const storage = join(workspaceReal, ".ahpah-projects");
  await mkdir(storage, { recursive: true });
  if ((await lstat(storage)).isSymbolicLink() || await realpath(storage) !== storage)
    throw new ProjectError(400, "The project storage folder cannot be a filesystem link.");
  const project = join(storage, projectId);
  await mkdir(project, { recursive: true });
  if ((await lstat(project)).isSymbolicLink() || await realpath(project) !== project || !inside(storage, project))
    throw new ProjectError(400, "The project folder cannot be a filesystem link.");
  return project;
}

async function assertProjectFolder(folder: string): Promise<void> {
  if ((await lstat(folder)).isSymbolicLink() || await realpath(folder) !== folder)
    throw new ProjectError(400, "The project folder cannot be a filesystem link.");
}

async function writeManifest(folder: string, files: ProjectFile[]): Promise<void> {
  await assertProjectFolder(folder);
  const manifest = join(folder, ".ahpah-manifest.json");
  try {
    const metadata = await lstat(manifest);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink > 1) throw new ProjectError(400, "Invalid project manifest.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const handle = await open(manifest, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600);
  try { await handle.writeFile(JSON.stringify(files.map((file) => file.path)), "utf8"); } finally { await handle.close(); }
}

async function mirrorFiles(folder: string, files: ProjectFile[]): Promise<void> {
  const manifest = join(folder, ".ahpah-manifest.json");
  try {
    const metadata = await lstat(manifest);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink > 1 || metadata.size > 50_000) throw new ProjectError(400, "Invalid project manifest.");
    const previous = JSON.parse(await readFile(manifest, "utf8")) as unknown;
    if (Array.isArray(previous)) {
      const current = new Set(files.map((file) => file.path.toLowerCase()));
      for (const path of previous) {
        if (typeof path !== "string" || current.has(path.toLowerCase())) continue;
        try { await unlink(await checkedPath(folder, path)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  for (const file of files) {
    const destination = await checkedPath(folder, file.path, true);
    const handle = await open(destination, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600);
    try { await handle.writeFile(file.content, "utf8"); } finally { await handle.close(); }
  }
  await writeManifest(folder, files);
}

async function collectFiles(folder: string, approvedFiles: ProjectFile[]): Promise<{ files: ProjectFile[]; filesTruncated: boolean }> {
  await assertProjectFolder(folder);
  const files: ProjectFile[] = [];
  let total = 0;
  let filesTruncated = false;
  let entriesSeen = 0;
  const approvedPaths = new Set(approvedFiles.map((file) => file.path.toLowerCase()));
  const omittedApprovedPath = (path: string) => {
    const key = path.toLowerCase();
    if (approvedPaths.has(key) || [...approvedPaths].some((approved) => approved.startsWith(`${key}/`))) filesTruncated = true;
  };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  async function visit(directory: string, prefix = "", depth = 0) {
    if (depth > 20 || entriesSeen > 5_000) { filesTruncated = true; return; }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      entriesSeen++;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) { omittedApprovedPath(path); continue; }
      if (entry.name.startsWith(".ahpah") || SKIP_DIRECTORIES.has(entry.name.toLowerCase())) continue;
      try { normalizeProjectPath(path); } catch { continue; }
      if (entry.isDirectory()) { await visit(join(directory, entry.name), path, depth + 1); continue; }
      if (!entry.isFile()) continue;
      let destination: string;
      try { destination = await checkedPath(folder, path); }
      catch (error) {
        if (error instanceof ProjectError || (error as NodeJS.ErrnoException).code === "ENOENT") { omittedApprovedPath(path); continue; }
        throw error;
      }
      const metadata = await lstat(destination);
      if (metadata.size > FILE_BYTES || total + metadata.size > PROJECT_BYTES || files.length >= FILE_COUNT) { filesTruncated = true; continue; }
      const handle = await open(destination, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const limited = Buffer.alloc(FILE_BYTES + 1);
      let buffer: Buffer;
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.nlink > 1) { omittedApprovedPath(path); continue; }
        const read = await handle.read(limited, 0, limited.length, 0); buffer = limited.subarray(0, read.bytesRead);
      } finally { await handle.close(); }
      if (buffer.length > FILE_BYTES || total + buffer.length > PROJECT_BYTES) { filesTruncated = true; continue; }
      if (buffer.includes(0)) { omittedApprovedPath(path); continue; }
      try { files.push({ path, content: decoder.decode(buffer) }); total += buffer.length; }
      catch { omittedApprovedPath(path); /* Binary/non-UTF-8 output is omitted. */ }
    }
  }
  await visit(folder);
  // A missing path is a real deletion. An existing approved source that cannot
  // be represented as safe text is an incomplete snapshot, never a deletion.
  const returnedPaths = new Set(files.map((file) => file.path.toLowerCase()));
  for (const file of approvedFiles) {
    if (returnedPaths.has(file.path.toLowerCase())) continue;
    try { await lstat(await checkedPath(folder, file.path)); filesTruncated = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") filesTruncated = true; }
  }
  await writeManifest(folder, files);
  return { files, filesTruncated };
}

function terminateTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return Promise.resolve();
  if (process.platform === "win32") {
    return new Promise((finish) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", shell: false });
      killer.once("error", () => { child.kill("SIGKILL"); finish(); });
      killer.once("close", () => finish());
    });
  }
  try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  return Promise.resolve();
}

async function execute(folder: string, command: ReturnType<typeof parseProjectCommand>, npm: string | undefined, timeoutMs: number, signal: AbortSignal) {
  if (command.kind === "node") await access(await checkedPath(folder, command.args.at(-1)!), constants.R_OK);
  else {
    if (!npm) throw new ProjectError(503, "npm was not found beside Node. Install Node.js with npm to run package commands.");
    const packagePath = await checkedPath(folder, "package.json");
    let packageJson: { scripts?: Record<string, unknown> };
    try { packageJson = JSON.parse(await readFile(packagePath, "utf8")); } catch { throw new ProjectError(400, "npm commands require a valid package.json in this project."); }
    if (command.args[0] === "run" && typeof packageJson.scripts?.[command.args[1]] !== "string") throw new ProjectError(400, "That npm script does not exist in this project's package.json.");
  }
  if (signal.aborted) throw new ProjectError(499, "Project execution was cancelled.");
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL"])
    if (process.env[name]) environment[name] = process.env[name];
  const home = join(folder, ".ahpah-home");
  const temporary = join(folder, ".ahpah-temp");
  await mkdir(home, { recursive: true }); await mkdir(temporary, { recursive: true });
  for (const directory of [home, temporary]) {
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new ProjectError(400, "Internal project folders cannot be filesystem links.");
  }
  Object.assign(environment, { HOME: home, USERPROFILE: home, TMPDIR: temporary, TEMP: temporary, TMP: temporary, npm_config_cache: join(folder, ".ahpah-cache"), npm_config_userconfig: join(home, ".npmrc"), npm_config_audit: "false", npm_config_fund: "false", FORCE_COLOR: "0", CI: "1" });
  // Preparation performs filesystem work; Stop may arrive during those awaits.
  if (signal.aborted) throw new ProjectError(499, "Project execution was cancelled.");
  const child = spawn(process.execPath, command.kind === "npm" ? [npm!, ...command.args] : command.args, {
    cwd: folder, env: environment, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "", bytes = 0, truncated = false, timedOut = false;
  const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  const append = (chunk: Buffer, stream: "stdout" | "stderr") => {
    const remaining = Math.max(0, OUTPUT_BYTES - bytes);
    if (chunk.length > remaining) truncated = true;
    const text = decoders[stream].write(chunk.subarray(0, remaining));
    bytes += Math.min(chunk.length, remaining);
    if (stream === "stdout") stdout += text; else stderr += text;
  };
  child.stdout!.on("data", (chunk: Buffer) => append(chunk, "stdout"));
  child.stderr!.on("data", (chunk: Buffer) => append(chunk, "stderr"));
  let terminating: Promise<void> | undefined;
  const terminate = () => { terminating ??= terminateTree(child); };
  const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
  signal.addEventListener("abort", terminate, { once: true });
  if (signal.aborted) terminate();
  try {
    const exitCode = await new Promise<number | null>((finish, reject) => {
      child.once("error", reject);
      child.once("close", (code) => finish(code));
    });
    if (terminating) await terminating;
    // When bounded output cuts a UTF-8 sequence, omit that unfinished character.
    // Normal closes still flush genuinely incomplete/invalid process output.
    if (!truncated) { stdout += decoders.stdout.end(); stderr += decoders.stderr.end(); }
    return { stdout, stderr, exitCode, timedOut, truncated, cancelled: signal.aborted };
  } finally { clearTimeout(timer); signal.removeEventListener("abort", terminate); }
}

async function buildPreview(folder: string, projectId: string): Promise<string | undefined> {
  for (const directory of ["dist", "build"]) {
    try {
      const file = await checkedPath(folder, `${directory}/index.html`, false, true);
      if ((await lstat(file)).size <= 10_000_000) return `/api/project/preview/${projectId}/${directory}/index.html`;
    } catch { /* This project has no safe static build in this folder. */ }
  }
  return undefined;
}

const PREVIEW_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", txt: "text/plain; charset=utf-8", wasm: "application/wasm",
};

async function servePreview(workspace: string, pathname: string, response: ServerResponse, host: string) {
  const match = pathname.match(/^\/api\/project\/preview\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})\/(dist|build)\/(.+)$/);
  if (!match) throw new ProjectError(404, "Unknown project preview.");
  let path: string;
  try { path = normalizeProjectPath(`${match[2]}/${decodeURIComponent(match[3])}`, true); }
  catch { throw new ProjectError(400, "Invalid project preview path."); }
  const folder = join(await realpath(workspace), ".ahpah-projects", match[1]);
  await assertProjectFolder(folder);
  const storage = dirname(folder);
  if ((await lstat(storage)).isSymbolicLink() || await realpath(storage) !== storage) throw new ProjectError(400, "Invalid preview storage.");
  const file = await checkedPath(folder, path, false, true);
  const extension = path.split(".").at(-1)!.toLowerCase();
  if (!PREVIEW_TYPES[extension]) throw new ProjectError(404, "This preview asset type is not supported.");
  if ((await lstat(file)).size > 10_000_000) throw new ProjectError(413, "Preview asset is too large.");
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let content: Buffer;
  try {
    const bounded = Buffer.alloc(10_000_001);
    const result = await handle.read(bounded, 0, bounded.length, 0);
    if (result.bytesRead > 10_000_000) throw new ProjectError(413, "Preview asset is too large.");
    content = bounded.subarray(0, result.bytesRead);
  } finally { await handle.close(); }
  // Ordinary Vite builds use root asset URLs. Keep those assets within this
  // project's preview URL without changing the exported build on disk.
  const previewBase = `/api/project/preview/${match[1]}/${match[2]}/`;
  if (extension === "html") content = Buffer.from(content.toString("utf8").replace(/\b(src|href)(\s*=\s*)(["'])\/(?!\/)([^"']*)\3/gi, `$1$2$3${previewBase}$4$3`));
  if (extension === "css") content = Buffer.from(content.toString("utf8").replace(/url\(\s*(["']?)\/(?!\/)([^)'"\s]+)\1\s*\)/gi, `url($1${previewBase}$2$1)`));
  if (extension === "js" || extension === "mjs") content = Buffer.from(content.toString("utf8").replace(/(["'])\/assets\/([^"'\s]+)\1/g, `$1${previewBase}assets/$2$1`));
  response.writeHead(200, {
    "Content-Type": PREVIEW_TYPES[extension], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Security-Policy": `sandbox allow-scripts; default-src 'none'; script-src http://${host} 'unsafe-inline'; style-src http://${host} 'unsafe-inline'; img-src http://${host} data: blob: https:; font-src http://${host} data:; connect-src http://${host}; frame-ancestors 'self'; base-uri 'none'; form-action 'none';`,
  });
  response.end(content);
}

export function createProjectMiddleware(options: ProjectBridgeOptions = {}) {
  const active = new Set<string>();
  const workspace = resolve(options.workspaceRoot || process.cwd());
  const timeoutMs = Math.max(25, Math.min(options.timeoutMs ?? 120_000, 120_000));
  return async function projectMiddleware(request: IncomingMessage, response: ServerResponse, next: () => void) {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (!pathname.startsWith("/api/project/")) { next(); return; }
    const json = (status: number, body: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify(body));
    };
    const preview = pathname.startsWith("/api/project/preview/");
    if (pathname !== "/api/project/run" && pathname !== "/api/project/capabilities" && !preview) { json(404, { error: { message: "Unknown project route." } }); return; }
    if (request.method !== (pathname.endsWith("/run") ? "POST" : "GET")) { json(405, { error: { message: "Method not allowed." } }); return; }
    // Sandboxed frames load classic scripts, styles and images without Origin;
    // their ES modules use Origin: null. Both remain limited to read-only build
    // assets, unpredictable project IDs and loopback clients/server bindings.
    const originAllowed = preview && (!request.headers.origin || request.headers.origin === "null");
    const checkRequest = originAllowed ? Object.assign(Object.create(request), { headers: { ...request.headers, origin: undefined, "sec-fetch-site": undefined } }) as IncomingMessage : request;
    const allowed = localRequest(checkRequest, pathname.endsWith("/run")) && (options.isLoopbackBinding?.() ?? true);
    if (!allowed) { json(403, { available: false, error: { message: "Project commands require this app on a loopback-only local server and a same-origin request." } }); return; }
    if (preview) {
      try { await servePreview(workspace, pathname, response, request.headers.host!); }
      catch (error) { json(error instanceof ProjectError ? error.status : 404, { error: { message: error instanceof ProjectError ? error.message : "This build preview was not found." } }); }
      return;
    }
    if (pathname.endsWith("/capabilities")) {
      const npm = await findNpm();
      json(200, { available: true, commands: npm ? COMMANDS : ["node <file>", "node --check <file>"], timeoutMs, limits: { fileBytes: FILE_BYTES, projectBytes: PROJECT_BYTES, files: FILE_COUNT, outputBytes: OUTPUT_BYTES }, executionNotice: "Approved commands execute real Node/npm code on your computer in a dedicated project folder. This is not an OS security sandbox." });
      return;
    }
    const controller = new AbortController();
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    response.once("close", disconnect);
    request.once("aborted", disconnect);
    let projectId: string | undefined;
    let acquired = false;
    try {
      if (!request.headers["content-type"]?.startsWith("application/json")) throw new ProjectError(415, "Project commands require JSON.");
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > PROJECT_BYTES * 6 + FILE_COUNT * 1_000) throw new ProjectError(413, "Project request is too large.");
        chunks.push(Buffer.from(chunk));
      }
      let payload: unknown;
      try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ProjectError(400, "Invalid project JSON."); }
      const run = parseRun(payload);
      const command = parseProjectCommand(run.command);
      projectId = run.projectId || randomUUID();
      if (active.has(projectId)) throw new ProjectError(409, "A command is already running for this project. Stop it before starting another.");
      active.add(projectId);
      acquired = true;
      const folder = await projectFolder(workspace, projectId);
      if (controller.signal.aborted) return;
      await mirrorFiles(folder, run.files);
      const result = await execute(folder, command, await findNpm(), timeoutMs, controller.signal);
      if (controller.signal.aborted) return;
      const files = await collectFiles(folder, run.files);
      json(200, { projectId, command: run.command, ...result, ...files, previewUrl: await buildPreview(folder, projectId) });
    } catch (error) {
      if (controller.signal.aborted) return;
      json(error instanceof ProjectError ? error.status : 500, { error: { message: error instanceof ProjectError ? error.message : "Could not prepare or run the local project. Check its files and your Node installation." } });
    } finally {
      if (projectId && acquired) active.delete(projectId);
      response.off("close", disconnect); request.off("aborted", disconnect);
    }
  };
}

export const projectMiddleware = createProjectMiddleware();

export function projectBridge(): Plugin {
  return {
    name: "ahpah-project-bridge",
    configureServer(server) {
      server.middlewares.use(createProjectMiddleware({ workspaceRoot: server.config.root, isLoopbackBinding: () => {
        const address = server.httpServer?.address();
        return !!address && typeof address !== "string" && isLoopback(address.address);
      } }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createProjectMiddleware({ workspaceRoot: server.config.root, isLoopbackBinding: () => {
        const address = server.httpServer.address();
        return !!address && typeof address !== "string" && isLoopback(address.address);
      } }));
    },
  };
}
