import type { EngineeringChangeSet, EngineeringFile, EngineeringProject, ProjectChange } from '../types/engineering.ts';

export const PROJECT_STORAGE_KEY = 'ahpah_engineering_project_v1';
export const MAX_PROJECT_FILES = 200;
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const unsafeSegments = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.cache', '__macosx', '.aws', '.ssh']);

export function normalizeProjectPath(value: string): string {
  if (typeof value !== 'string') throw new Error('File paths must be text.');
  const path = value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!path || path.length > 240 || path.startsWith('/') || /^[a-z]:/i.test(path) || [...path].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /[:#?*"<>|]/.test(path))
    throw new Error('Use a relative project file path without drive letters or control characters.');
  const segments = path.split('/');
  if (segments.some(part => !part || part === '.' || part === '..' || unsafeSegments.has(part.toLowerCase()) || part.toLowerCase().startsWith('.ahpah') || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    throw new Error('Paths cannot escape the project or include generated dependency folders.');
  if (/(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.yarnrc(?:\.yml)?|\.netrc|\.git-credentials|credentials(?:\.json)?|.*\.(?:pem|key|p12|pfx)|id_rsa|id_ed25519)$/i.test(path))
    throw new Error('Private .env and key files stay outside the coding workspace. Configure credentials in Settings or your local environment.');
  return path;
}

export function validateProjectFiles(value: unknown): EngineeringFile[] {
  if (!Array.isArray(value) || value.length > MAX_PROJECT_FILES) throw new Error(`Projects support up to ${MAX_PROJECT_FILES} source files.`);
  const seen = new Set<string>();
  let size = 0;
  const result = value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.content !== 'string') throw new Error('Each project file needs a path and text content.');
    const path = normalizeProjectPath(item.path);
    if (seen.has(path.toLowerCase())) throw new Error(`Duplicate file path: ${path}`);
    seen.add(path.toLowerCase());
    const bytes = encoder.encode(item.content).byteLength;
    if (bytes > MAX_FILE_BYTES) throw new Error(`${path} exceeds the 256 KB source file limit.`);
    if (item.content.includes('\0')) throw new Error(`${path} appears to be binary. Import text source files only.`);
    size += bytes;
    return { path, content: item.content };
  });
  if (size > MAX_PROJECT_BYTES) throw new Error('The project exceeds the 2 MB source limit. Import a smaller source folder.');
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export function createStarterProject(): EngineeringProject {
  return {
    schema: 1, id: crypto.randomUUID(), name: 'Untitled project', revision: 0, updatedAt: new Date().toISOString(),
    files: [
      { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>My next idea</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <main class="app">\n    <span class="eyebrow">BUILT WITH AHPAH</span>\n    <h1>Your next idea<br>starts here.</h1>\n    <p>A real project. Your files. An agent that helps you build.</p>\n    <button id="start-button">Let’s build something ↗</button>\n    <p id="status" aria-live="polite"></p>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n' },
      { path: 'styles.css', content: ':root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #0c0e17; color: #f0edf7; }\n* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 15%, #27203e, transparent 65%); }\n.app { max-width: 780px; padding: 70px 28px; text-align: center; }\n.eyebrow { font-size: 11px; letter-spacing: .22em; color: #bca2ee; }\nh1 { font-size: clamp(44px, 8vw, 80px); line-height: 1.06; letter-spacing: -.06em; font-weight: 650; }\np { color: #a29ab2; line-height: 1.8; }\nbutton { margin-top: 24px; background: #c5adf3; color: #181022; border: 0; border-radius: 12px; padding: 16px 22px; font: inherit; cursor: pointer; transition: transform .2s; }\nbutton:hover { transform: translateY(-2px); }\n@media (prefers-reduced-motion: reduce) { button { transition: none; } }\n' },
      { path: 'script.js', content: 'document.getElementById("start-button").addEventListener("click", () => {\n  document.getElementById("status").textContent = "Ready. Describe your idea in the engineering workspace.";\n});\n' },
    ],
  };
}

export function validateEngineeringProject(value: unknown): EngineeringProject {
  if (!value || typeof value !== 'object') throw new Error('Invalid project data.');
  const item = value as Record<string, unknown>;
  if (item.schema !== 1 || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100)
    throw new Error('The project metadata is invalid.');
  return { schema: 1, id: item.id, name: item.name, files: validateProjectFiles(item.files), revision: Number.isSafeInteger(item.revision) && (item.revision as number) >= 0 ? item.revision as number : 0, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString() };
}

export function diffProjectFiles(before: EngineeringFile[], after: EngineeringFile[]): ProjectChange[] {
  const oldFiles = new Map(before.map(file => [file.path, file.content]));
  const newFiles = new Map(after.map(file => [file.path, file.content]));
  return [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort().flatMap(path => {
    const old = oldFiles.get(path) ?? null;
    const next = newFiles.get(path) ?? null;
    return old === next ? [] : [{ path, before: old, after: next }];
  });
}

export function applyProjectChanges(project: EngineeringProject, changes: ProjectChange[], force = false): EngineeringProject {
  const files = new Map(project.files.map(file => [file.path, file.content]));
  const seen = new Set<string>();
  for (const change of changes) {
    const path = normalizeProjectPath(change.path);
    if (seen.has(path)) throw new Error(`Duplicate change: ${path}`);
    seen.add(path);
    if (!force && (files.get(path) ?? null) !== change.before) throw new Error(`${path} changed since the agent read it. Keep your edits and run the goal again, or discard this change.`);
    if (change.after === null) files.delete(path);
    else if (typeof change.after === 'string') files.set(path, change.after);
    else throw new Error(`Invalid change content: ${path}`);
  }
  return { ...project, files: validateProjectFiles([...files].map(([path, content]) => ({ path, content }))), revision: project.revision + 1, updatedAt: new Date().toISOString() };
}

export function inverseProjectChanges(changes: ProjectChange[]): ProjectChange[] {
  return changes.map(change => ({ path: change.path, before: change.after, after: change.before }));
}

export function createChangeSet(project: EngineeringProject, updatedFiles: EngineeringFile[], goal: string): EngineeringChangeSet {
  return { id: crypto.randomUUID(), goal, createdAt: new Date().toISOString(), baseRevision: project.revision, changes: diffProjectFiles(project.files, validateProjectFiles(updatedFiles)), plan: [], summary: '', review: '', commands: [], model: '', tokens: 0 };
}

export function validateChangeSet(value: unknown): EngineeringChangeSet {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved review.');
  const item = value as EngineeringChangeSet;
  if (typeof item.id !== 'string' || typeof item.goal !== 'string' || !Array.isArray(item.changes) || item.changes.length > MAX_PROJECT_FILES * 2) throw new Error('Invalid saved review.');
  const seen = new Set<string>();
  const changes = item.changes.map(change => {
    const path = normalizeProjectPath(change.path);
    if (seen.has(path)) throw new Error('Duplicate saved change.');
    seen.add(path);
    if ((change.before !== null && typeof change.before !== 'string') || (change.after !== null && typeof change.after !== 'string')) throw new Error('Invalid saved change content.');
    if (change.before !== null) validateProjectFiles([{ path, content: change.before }]);
    if (change.after !== null) validateProjectFiles([{ path, content: change.after }]);
    return { path, before: change.before, after: change.after };
  });
  validateProjectFiles(changes.filter(change => change.after !== null).map(change => ({ path: change.path, content: change.after! })));
  return { id: item.id.slice(0, 80), goal: item.goal.slice(0, 10000), createdAt: typeof item.createdAt === 'string' ? item.createdAt : '', baseRevision: Number.isSafeInteger(item.baseRevision) ? item.baseRevision : 0, changes, plan: Array.isArray(item.plan) ? item.plan.filter(step => typeof step === 'string').slice(0, 12).map(step => step.slice(0, 500)) : [], summary: typeof item.summary === 'string' ? item.summary.slice(0, 5000) : '', review: typeof item.review === 'string' ? item.review.slice(0, 5000) : '', commands: Array.isArray(item.commands) ? item.commands.filter(command => typeof command === 'string').slice(0, 10).map(command => command.slice(0, 240)) : [], model: typeof item.model === 'string' ? item.model.slice(0, 240) : '', tokens: Number.isFinite(item.tokens) && item.tokens >= 0 ? item.tokens : 0 };
}

export function projectByteSize(files: EngineeringFile[]): number { return files.reduce((size, file) => size + encoder.encode(file.content).byteLength, 0); }

export function shouldImportSourcePath(path: string): boolean {
  const segments = path.replace(/\\/g, '/').split('/');
  return !segments.some(part => unsafeSegments.has(part.toLowerCase()) || part.toLowerCase().startsWith('.ahpah')) &&
    !/\.(?:png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|woff2?|ttf|otf|eot|mp[34]|wav|ogg|zip|gz|tar|exe|dll|wasm|sqlite3?|db)$/i.test(path) &&
    !/(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.yarnrc(?:\.yml)?|\.netrc|\.git-credentials|credentials(?:\.json)?|.*\.(?:pem|key|p12|pfx)|id_rsa|id_ed25519)$/i.test(path);
}

export async function importSourceFiles(files: File[], stripRoot = false, onSkipped?: (skipped: { path: string; reason: string }[]) => void): Promise<EngineeringFile[]> {
  const skipped: { path: string; reason: string }[] = [];
  const candidates = files.map(file => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }))
    .filter(item => { const allowed = shouldImportSourcePath(item.path); if (!allowed) skipped.push({ path: item.path, reason: 'Generated, private, or binary file' }); return allowed; });
  if (candidates.length > MAX_PROJECT_FILES) throw new Error(`Choose a source folder with fewer than ${MAX_PROJECT_FILES} files.`);
  const imported = await Promise.all(candidates.map(async ({ file, path }) => {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${path} exceeds the 256 KB source file limit.`);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { skipped.push({ path, reason: 'Binary or non-UTF-8 file' }); return null; }
    if (content.includes('\0')) { skipped.push({ path, reason: 'Binary file' }); return null; }
    return { path: stripRoot && path.includes('/') ? path.slice(path.indexOf('/') + 1) : path, content };
  }));
  onSkipped?.(skipped);
  const source = imported.filter((file): file is EngineeringFile => file !== null);
  if (!source.length) throw new Error('No source files were found. Generated folders, binaries, and private .env/key files are skipped.');
  return validateProjectFiles(source);
}

// Dependency-free ZIP STORE writer. CRC and UTF-8 names keep downloads compatible with standard ZIP tools.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createProjectZip(files: EngineeringFile[]): Uint8Array {
  const source = validateProjectFiles(files);
  const entries = source.map(file => ({ name: encoder.encode(file.path), data: encoder.encode(file.content), crc: crc32(encoder.encode(file.content)) }));
  const length = entries.reduce((total, entry) => total + 30 + entry.name.length + entry.data.length + 46 + entry.name.length, 22);
  const zip = new Uint8Array(length);
  const view = new DataView(zip.buffer);
  let offset = 0;
  const offsets: number[] = [];
  const u16 = (at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (at: number, value: number) => view.setUint32(at, value, true);
  for (const entry of entries) {
    offsets.push(offset); u32(offset, 0x04034b50); u16(offset + 4, 20); u16(offset + 6, 0x800); u16(offset + 8, 0); u16(offset + 12, 33);
    u32(offset + 14, entry.crc); u32(offset + 18, entry.data.length); u32(offset + 22, entry.data.length); u16(offset + 26, entry.name.length);
    zip.set(entry.name, offset + 30); zip.set(entry.data, offset + 30 + entry.name.length); offset += 30 + entry.name.length + entry.data.length;
  }
  const centralStart = offset;
  entries.forEach((entry, index) => {
    u32(offset, 0x02014b50); u16(offset + 4, 20); u16(offset + 6, 20); u16(offset + 8, 0x800); u16(offset + 14, 33);
    u32(offset + 16, entry.crc); u32(offset + 20, entry.data.length); u32(offset + 24, entry.data.length); u16(offset + 28, entry.name.length); u32(offset + 42, offsets[index]);
    zip.set(entry.name, offset + 46); offset += 46 + entry.name.length;
  });
  u32(offset, 0x06054b50); u16(offset + 8, entries.length); u16(offset + 10, entries.length); u32(offset + 12, offset - centralStart); u32(offset + 16, centralStart);
  return zip;
}

function resolveLocalPath(reference: string, owner: string): string | null {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return null;
  const clean = reference.split(/[?#]/)[0];
  const parts = clean.startsWith('/') ? [] : owner.split('/').slice(0, -1);
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  try { return normalizeProjectPath(decodeURIComponent(parts.join('/'))); } catch { return null; }
}

function dataUrl(content: string, type: string): string { return `data:${type};charset=utf-8,${encodeURIComponent(content)}`; }
const mimeForPath = (path: string) => path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.json') ? 'application/json' : 'text/plain';

export interface ProjectPreview { html: string; issues: string[] }
export function buildProjectPreview(files: EngineeringFile[], entryPath = 'index.html', channel = 'ahpah-preview'): ProjectPreview {
  return renderProjectHtml(files, entryPath, channel);
}

// Export the actual project without iframe monitoring or the editor's preview policy.
export function buildProjectHtml(files: EngineeringFile[], entryPath = 'index.html'): ProjectPreview {
  return renderProjectHtml(files, entryPath, null);
}

function renderProjectHtml(files: EngineeringFile[], entryPath: string, channel: string | null): ProjectPreview {
  const map = new Map(validateProjectFiles(files).map(file => [file.path, file.content]));
  const entry = map.get(entryPath);
  if (entry === undefined) return { html: '', issues: [`Choose an HTML entry file. ${entryPath} is not in this project.`] };
  const issues: string[] = [];
  const escapeScript = (text: string) => text.replace(/<\/script/gi, '<\\/script');
  const escapeStyle = (text: string) => text.replace(/<\/style/gi, '<\\/style');
  const css = (content: string, owner: string, visiting = new Set<string>()): string => {
    return content.replace(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/gi, (match, reference: string) => {
      const path = resolveLocalPath(reference, owner);
      if (!path) return match;
      if (!map.has(path)) { issues.push(`Missing stylesheet: ${path}`); return ''; }
      if (visiting.has(path)) { issues.push(`Circular stylesheet import: ${path}`); return ''; }
      return css(map.get(path)!, path, new Set([...visiting, path]));
    }).replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (match, _quote: string, reference: string) => {
      const path = resolveLocalPath(reference.trim(), owner);
      if (!path) return match;
      const resource = map.get(path);
      if (resource === undefined) { issues.push(`Missing asset: ${path}`); return 'url("")'; }
      return `url("${dataUrl(resource, mimeForPath(path))}")`;
    });
  };
  const rewriteModuleImports = (content: string, owner: string) => content.replace(/((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'])([^"']+)(["'])/g, (match, prefix: string, reference: string, suffix: string) => {
    if (!reference.startsWith('.') && !reference.startsWith('/')) return match;
    const resolved = resolveLocalPath(reference, owner);
    if (!resolved || !map.has(resolved)) { issues.push(`Missing module: ${reference} in ${owner}`); return match; }
    return `${prefix}ahpah-project/${resolved}${suffix}`;
  });
  const modules = new Map<string, string>();
  for (const [path, content] of map) {
    if (/\.(?:m?js)$/i.test(path)) {
      const rewritten = rewriteModuleImports(content, path);
      modules.set(`ahpah-project/${path}`, dataUrl(rewritten, 'text/javascript'));
    }
  }
  let html = entry.replace(/<link\b([^>]*?)>/gi, (tag, attributes: string) => {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(attributes)) return tag;
    const reference = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const path = reference && resolveLocalPath(reference, entryPath);
    if (!path) return tag;
    if (!map.has(path)) { issues.push(`Missing stylesheet: ${path}`); return ''; }
    return `<style data-project-file="${path.replace(/"/g, '&quot;')}">${escapeStyle(css(map.get(path)!, path, new Set([path])))}</style>`;
  }).replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi, (tag, before: string, reference: string, after: string) => {
    const path = resolveLocalPath(reference, entryPath);
    if (!path) return tag;
    const source = map.get(path);
    if (source === undefined) { issues.push(`Missing script: ${path}`); return ''; }
    if (/\btype\s*=\s*["']module["']/i.test(before + after)) return `<script type="module">import ${JSON.stringify(`ahpah-project/${path}`)};</script>`;
    return `<script ${before} ${after} data-project-file="${path.replace(/"/g, '&quot;')}">${escapeScript(source)}</script>`;
  }).replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, attributes: string, source: string) => {
    if (!/\btype\s*=\s*["']module["']/i.test(attributes)) return tag;
    return `<script${attributes}>${escapeScript(rewriteModuleImports(source, entryPath))}</script>`;
  }).replace(/\b(src|poster)\s*=\s*["']([^"']+)["']/gi, (match, attribute: string, reference: string) => {
    const path = resolveLocalPath(reference, entryPath);
    if (!path) return match;
    const content = map.get(path);
    if (content === undefined) { issues.push(`Missing asset: ${path}`); return match; }
    return `${attribute}="${dataUrl(content, mimeForPath(path))}"`;
  });
  const monitor = `<script>(()=>{const channel=${JSON.stringify(channel)};const report=(message)=>parent.postMessage({channel,kind:"runtime-error",message:String(message).slice(0,3000)},"*");addEventListener("error",e=>report(e.message+" at "+(e.filename||"preview")+":"+e.lineno));addEventListener("unhandledrejection",e=>report(e.reason?.message||e.reason||"Unhandled promise rejection"));})();</script>`;
  const importMap = `<script type="importmap">${escapeScript(JSON.stringify({ imports: Object.fromEntries(modules) }))}</script>`;
  // A sandboxed iframe gets an opaque origin; project scripts cannot access the app's files or keys.
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src data: blob: https:; script-src \'unsafe-inline\' \'unsafe-eval\' data: blob: https:; style-src \'unsafe-inline\' data: https:; connect-src https:; form-action \'none\'; base-uri \'none\'">';
  const additions = `${channel === null ? '<meta charset="utf-8">' : policy + monitor}${importMap}`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, match => `${match}${additions}`);
  else if (channel === null && /<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, match => `${match}<head>${additions}</head>`);
  else if (channel === null) html = `<!doctype html><html><head>${additions}</head><body>${html}</body></html>`;
  else html = `${additions}${html}`;
  return { html, issues: [...new Set(issues)] };
}
