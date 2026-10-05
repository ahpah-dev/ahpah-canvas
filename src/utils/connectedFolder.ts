import type { HtmlArtifact } from './htmlExport.ts';

type FolderHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
};
type PickerWindow = Window & { showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<FolderHandle> };
export interface FolderState {
  supported: boolean; name: string; status: 'disconnected' | 'connecting' | 'permission' | 'connected' | 'saving';
  lastSaved: string; error: string;
  pendingCount: number;
}
let folder: FolderHandle | null = null;
let state: FolderState = { supported: typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function', name: '', status: 'disconnected', lastSaved: '', error: '', pendingCount: 0 };
const pendingExports = new Map<string, { artifact: HtmlArtifact; onSaved?: (destination: string) => void }>();
const listeners = new Set<() => void>();
let initialized: Promise<void> | undefined;
let generation = 0;
let writeQueue: Promise<unknown> = Promise.resolve();
const update = (value: Partial<FolderState>) => { state = { ...state, ...value }; listeners.forEach(listener => listener()); };
export const folderSnapshot = () => state;
export const subscribeFolder = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

async function storedFolder(mode: 'read' | 'write' | 'delete', handle?: FolderHandle): Promise<FolderHandle | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ahpah-local-folder', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('connections');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<FolderHandle | null>((resolve, reject) => {
      const transaction = db.transaction('connections', mode === 'read' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('connections');
      const request = mode === 'read' ? store.get('exports') : mode === 'write' ? store.put(handle, 'exports') : store.delete('exports');
      transaction.oncomplete = () => resolve(mode === 'read' ? request.result ?? null : null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Folder connection could not be remembered.'));
    });
  } finally { db.close(); }
}

export function restoreConnectedFolder(): Promise<void> {
  if (initialized) return initialized;
  const session = generation;
  initialized = (async () => {
    if (!state.supported) return;
    try {
      const saved = await storedFolder('read');
      if (session !== generation || !saved) return;
      const permission = await saved.queryPermission({ mode: 'readwrite' });
      if (session !== generation) return;
      folder = saved;
      update({ name: saved.name, status: permission === 'granted' ? 'connected' : 'permission' });
    } catch { /* A missing remembered connection does not prevent a new connection. */ }
  })();
  return initialized;
}

// Must be called directly from the Connect button so the browser can show its native picker.
export async function connectFolder(change = false): Promise<void> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) { update({ error: 'This browser cannot connect a writable PC folder. Open this app in desktop Chrome or Edge to connect one.' }); return; }
  const previous = { ...state };
  const session = ++generation;
  update({ status: 'connecting', error: '' });
  try {
    const selected = folder && !change ? folder : await picker.call(window, { id: 'ahpah-exports', mode: 'readwrite' });
    if (await selected.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Folder write permission was not granted. Connect again and allow file changes.');
    if (session !== generation) return;
    folder = selected; update({ name: selected.name, status: 'connected', lastSaved: '', error: '' });
    try { await storedFolder('write', selected); } catch { if (session === generation) update({ error: 'Folder connected for this session. Your browser could not remember it for next time.' }); }
    if (session === generation) await flushPendingHtml();
  } catch (error) {
    if (session !== generation) return;
    update({ status: previous.status, error: error instanceof DOMException && error.name === 'AbortError' ? '' : error instanceof Error ? error.message : 'Could not connect the folder.' });
  }
}

export async function disconnectFolder(): Promise<void> {
  ++generation; folder = null; pendingExports.clear(); update({ name: '', status: 'disconnected', lastSaved: '', error: '', pendingCount: 0 });
  try { await storedFolder('delete'); } catch { update({ error: 'Disconnected for this session. Browser storage could not forget the previous connection.' }); }
}

export async function saveHtmlToFolder(artifact: HtmlArtifact): Promise<string> {
  const target = folder;
  const session = generation;
  if (!target || !['connected', 'saving'].includes(state.status)) {
    const message = state.status === 'permission' ? 'Reconnect your folder to restore write permission, then retry the export.' : 'Connect a folder in the top bar first. HTML exports will be saved there automatically.';
    update({ error: message }); throw new Error(message);
  }
  // oxlint-disable-next-line no-control-regex -- Never allow path separators or control characters in a PC filename.
  if (!/^[^<>:"/\\|?*\u0000-\u001f]+\.html$/i.test(artifact.filename) || artifact.html.length > 16_000_000) throw new Error('Invalid HTML export filename or size.');
  const operation = writeQueue.catch(() => undefined).then(async () => {
    if (session !== generation) throw new Error('The folder connection changed. Retry the export into the current folder.');
    try {
      if (await target.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        update({ status: 'permission' }); throw new Error('Folder access expired. Reconnect the folder in the top bar, then retry the export.');
      }
      if (session !== generation) throw new Error('The folder connection changed before the export. Retry in the current folder.');
      update({ status: 'saving', error: '' });
      let existing: FileSystemFileHandle | null = null;
      try { existing = await target.getFileHandle(artifact.filename); } catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
      if (existing) {
        const previous = await existing.getFile();
        if (previous.size > 16_000_000) throw new Error('The existing file is too large to back up. Choose a different export name.');
        if (await previous.text() !== artifact.html) {
          const backup = await target.getFileHandle(artifact.filename.replace(/\.html$/i, '.previous.html'), { create: true });
          const backupWriter = await backup.createWritable();
          try { await backupWriter.write(previous); await backupWriter.close(); } catch (error) { await backupWriter.abort().catch(() => undefined); throw error; }
        }
      }
      const file = existing ?? await target.getFileHandle(artifact.filename, { create: true });
      const writer = await file.createWritable();
      try { await writer.write(artifact.html); await writer.close(); } catch (error) { await writer.abort().catch(() => undefined); throw error; }
      const saved = `${target.name}/${artifact.filename}`;
      if (session === generation) update({ status: 'connected', lastSaved: saved, error: '' });
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be written to your PC.';
      const permissionLost = error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
      if (session === generation) update({ status: state.status === 'permission' || permissionLost ? 'permission' : 'connected', error: message });
      throw new Error(message);
    }
  });
  writeQueue = operation;
  return operation;
}

// A generated file waits for the initial connection or restored permission, without a Save click.
export async function autoSaveHtmlToFolder(artifact: HtmlArtifact, onSaved?: (destination: string) => void): Promise<{ saved: true; destination: string } | { saved: false; reason: string }> {
  await restoreConnectedFolder();
  if (['connected', 'saving'].includes(state.status)) {
    try { return { saved: true, destination: await saveHtmlToFolder(artifact) }; }
    catch (error) { if (state.status !== 'permission') throw error; }
  }
  if (!pendingExports.has(artifact.filename) && pendingExports.size >= 10) throw new Error('Ten HTML files are already waiting for a folder. Connect your folder to save them before creating more.');
  pendingExports.set(artifact.filename, { artifact, onSaved }); update({ pendingCount: pendingExports.size });
  return { saved: false, reason: state.status === 'permission' ? 'Reconnect the folder to save this file automatically.' : 'Connect a folder to save this file automatically.' };
}

async function flushPendingHtml(): Promise<void> {
  for (const [filename, pending] of pendingExports) {
    if (!['connected', 'saving'].includes(state.status)) break;
    try {
      const destination = await saveHtmlToFolder(pending.artifact);
      if (pendingExports.get(filename) === pending) pendingExports.delete(filename);
      update({ pendingCount: pendingExports.size });
      pending.onSaved?.(destination);
    } catch { break; /* Keep the actual source ready for a later connection attempt. */ }
  }
}
