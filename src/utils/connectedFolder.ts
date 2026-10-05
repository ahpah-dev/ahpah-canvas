import type { EngineeringFile } from '../types/engineering.ts';
import type { HtmlArtifact } from './htmlExport.ts';
import { normalizeProjectPath, validateProjectFiles } from './projectFiles.ts';

type FolderHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
};
type PickerWindow = Window & { showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<FolderHandle> };
type PendingFile = EngineeringFile & { group: string; html: boolean };
type ConnectionRecord = { handle: FolderHandle; fingerprints: Record<string, string> };
type SaveGroup = { remaining: Set<string>; destinations: string[]; onSaved?: (destinations: string[]) => void };
export type FolderSaveResult = { saved: true; destinations: string[] } | { saved: false; reason: string };
export interface FolderState {
  supported: boolean; name: string; status: 'disconnected' | 'connecting' | 'permission' | 'connected' | 'saving';
  lastSaved: string; error: string; pendingCount: number; pendingPaths: string[];
}
let folder: FolderHandle | null = null;
let fingerprints: Record<string, string> = {};
let state: FolderState = { supported: typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function', name: '', status: 'disconnected', lastSaved: '', error: '', pendingCount: 0, pendingPaths: [] };
const pending = new Map<string, PendingFile>();
const groups = new Map<string, SaveGroup>();
const listeners = new Set<() => void>();
let initialized: Promise<void> | undefined;
let generation = 0;
let pendingRevision = 0;
let writeQueue: Promise<unknown> = Promise.resolve();
let storageQueue: Promise<unknown> = Promise.resolve();
let pendingQueue: Promise<unknown> = Promise.resolve();
let flushing: Promise<void> | undefined;
const MAX_HTML_BYTES = 16_000_000;
const MAX_PENDING_BYTES = 24_000_000;
const encoder = new TextEncoder();
const keyOf = (path: string) => path.toLowerCase();
const forgetGroup = (id: string) => { groups.delete(id); };
const update = (value: Partial<FolderState>) => { state = { ...state, ...value }; listeners.forEach(listener => listener()); };
const updatePending = () => update({ pendingCount: pending.size, pendingPaths: [...pending.values()].map(file => file.path) });
export const folderSnapshot = () => state;
export const subscribeFolder = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

async function databaseOperation<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ahpah-local-folder', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('connections');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    signal?.throwIfAborted();
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('connections', mode);
      const request = operation(transaction.objectStore('connections'));
      const abort = () => { try { transaction.abort(); } catch { /* A committed transaction is already complete. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal?.removeEventListener('abort', abort);
      transaction.oncomplete = () => { cleanup(); resolve(request.result as T); };
      transaction.onerror = () => { cleanup(); reject(transaction.error); };
      transaction.onabort = () => { cleanup(); reject(signal?.aborted ? signal.reason : transaction.error ?? new Error('Browser storage could not remember your local files.')); };
      if (signal?.aborted) abort();
    });
  } finally { db.close(); }
}
function storeValue(key: string, value: unknown, signal?: AbortSignal): Promise<void> {
  const operation = storageQueue.catch(() => undefined).then(() => databaseOperation<void>('readwrite', store => value === undefined ? store.delete(key) : store.put(value, key), signal));
  storageQueue = operation;
  return operation;
}
const persistConnection = () => folder ? storeValue('exports', { handle: folder, fingerprints: { ...fingerprints } }) : storeValue('exports', undefined);
const permissionError = (error: unknown) => error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
const checkActive = (session: number, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  if (session !== generation) throw new Error('The folder connection changed. No further files were written.');
};
async function fingerprint(content: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(content)));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
function htmlFile(artifact: HtmlArtifact): EngineeringFile {
  const path = normalizeProjectPath(artifact.filename);
  if (path.includes('/') || !/\.html$/i.test(path) || typeof artifact.html !== 'string' || encoder.encode(artifact.html).byteLength > MAX_HTML_BYTES || artifact.html.includes('\0')) throw new Error('Invalid HTML export filename or size.');
  return { path, content: artifact.html };
}
function mutatePending(action: (next: Map<string, PendingFile>) => void, signal?: AbortSignal): Promise<void> {
  const operation = pendingQueue.catch(() => undefined).then(async () => {
    signal?.throwIfAborted();
    const next = new Map(pending);
    action(next);
    await storeValue('pending-files', [...next.values()], signal);
    pending.clear(); next.forEach((file, key) => pending.set(key, file)); updatePending();
  });
  pendingQueue = operation;
  return operation;
}

export function restoreConnectedFolder(): Promise<void> {
  if (initialized) return initialized;
  const session = generation;
  const queueRevision = pendingRevision;
  initialized = (async () => {
    try {
      const queued = await databaseOperation<unknown>('readonly', store => store.get('pending-files'));
      if (Array.isArray(queued) && queueRevision === pendingRevision) {
        let bytes = 0;
        for (const value of queued.slice(0, 210)) {
          try {
            if (!value || typeof value !== 'object' || typeof value.content !== 'string' || typeof value.group !== 'string') continue;
            const file = value.html ? htmlFile({ filename: value.path, html: value.content, title: '' }) : validateProjectFiles([value])[0];
            bytes += encoder.encode(file.content).byteLength;
            if (bytes > MAX_PENDING_BYTES) break;
            if (!pending.has(keyOf(file.path))) pending.set(keyOf(file.path), { ...file, group: value.group, html: value.html === true });
          } catch { /* Invalid stored data never becomes a PC write. */ }
        }
        updatePending();
      }
      if (!state.supported || session !== generation || state.status === 'connecting') return;
      const record = await databaseOperation<ConnectionRecord | FolderHandle | undefined>('readonly', store => store.get('exports'));
      if (session !== generation || !record) return;
      const saved = 'handle' in record ? record.handle : record;
      const permission = await saved.queryPermission({ mode: 'readwrite' });
      if (session !== generation) return;
      folder = saved;
      fingerprints = 'handle' in record && record.fingerprints && typeof record.fingerprints === 'object' ? record.fingerprints : {};
      update({ name: saved.name, status: permission === 'granted' ? 'connected' : 'permission' });
      if (permission === 'granted') await flushPendingFiles();
    } catch { /* A remembered connection is optional; new connections still work. */ }
  })();
  return initialized;
}

// Call directly from a button: native folder selection and renewed permission require a user gesture.
export async function connectFolder(change = false): Promise<void> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) { update({ error: 'Open this app in desktop Chrome or Edge to connect a writable PC folder.' }); return; }
  if (state.status === 'saving' || state.status === 'connecting') return;
  const previous = { ...state };
  const oldFolder = folder;
  const session = ++generation;
  update({ status: 'connecting', error: '' });
  try {
    const selected = oldFolder && !change ? oldFolder : await picker.call(window, { id: 'ahpah-exports', mode: 'readwrite' });
    if (await selected.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Folder write permission was not granted. Connect again and allow file changes.');
    checkActive(session);
    await restoreConnectedFolder();
    const sameFolder = oldFolder ? await selected.isSameEntry(oldFolder) : false;
    checkActive(session);
    folder = selected;
    if (!sameFolder) fingerprints = {};
    update({ name: selected.name, status: 'connected', lastSaved: '', error: '' });
    try { await persistConnection(); } catch { if (session === generation) update({ error: 'Connected for this session. The browser could not remember this folder for next time.' }); }
    if (session === generation) {
      await flushPendingFiles();
      // A flush from the previous connection may have stopped as the picker changed it.
      if (session === generation && state.status === 'connected' && pending.size && !state.error) await flushPendingFiles();
    }
  } catch (error) {
    if (session !== generation) return;
    update({ status: previous.status, error: error instanceof DOMException && error.name === 'AbortError' ? '' : error instanceof Error ? error.message : 'Could not connect the folder.' });
    if (previous.status === 'connected') await flushPendingFiles();
  }
}
export async function disconnectFolder(): Promise<void> {
  ++generation; folder = null; fingerprints = {};
  update({ name: '', status: 'disconnected', lastSaved: '', error: '' });
  // Keep pending source: disconnecting must not throw away files already created by the agent.
  try { await persistConnection(); } catch { update({ error: 'Disconnected for this session. Browser storage could not forget the previous connection.' }); }
}
export async function clearPendingFolderFiles(): Promise<void> {
  if (state.status === 'saving' || state.status === 'connecting') return;
  ++pendingRevision;
  try { await mutatePending(next => next.clear()); groups.clear(); }
  catch { update({ error: 'Browser storage could not clear the pending queue. No queued files were discarded.' }); }
}
async function directoryFor(target: FileSystemDirectoryHandle, path: string, create: boolean): Promise<{ directory: FileSystemDirectoryHandle; filename: string }> {
  const parts = path.split('/');
  const filename = parts.pop()!;
  let directory = target;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
  return { directory, filename };
}
async function existingFile(target: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle | null> {
  try {
    const { directory, filename } = await directoryFor(target, path, false);
    return await directory.getFileHandle(filename);
  } catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
}
async function writeContent(file: FileSystemFileHandle, content: string, session: number, signal?: AbortSignal, current?: () => boolean): Promise<void> {
  checkActive(session, signal);
  if (current && !current()) throw new Error('A newer source version superseded this queued file.');
  const writer = await file.createWritable();
  try { await writer.write(content); checkActive(session, signal); if (current && !current()) throw new Error('A newer source version superseded this queued file.'); await writer.close(); }
  catch (error) { await writer.abort().catch(() => undefined); throw error; }
}
async function saveFiles(files: EngineeringFile[], html: boolean, signal?: AbortSignal, isCurrent?: () => boolean): Promise<string[]> {
  const target = folder;
  const session = generation;
  if (!target || !['connected', 'saving'].includes(state.status)) {
    const message = state.status === 'permission' ? 'Reconnect your folder to restore write permission.' : 'Connect a folder in the top bar. Completed source files will save there automatically.';
    update({ error: message }); throw new Error(message);
  }
  const operation = writeQueue.catch(() => undefined).then(async () => {
    const saved: string[] = [];
    const guard = () => { checkActive(session, signal); if (isCurrent && !isCurrent()) throw new Error('A newer source version superseded this queued file.'); };
    try {
      guard();
      const permission = await target.queryPermission({ mode: 'readwrite' });
      guard();
      if (permission !== 'granted') { update({ status: 'permission' }); throw new Error('Folder access expired. Reconnect your folder to resume automatic saving.'); }
      update({ status: 'saving', error: '' });
      const prepared: { file: EngineeringFile; previous: string | null; hash: string }[] = [];
      // Check the whole snapshot first: known conflicts cannot cause a partially replaced project.
      for (const file of files) {
        guard();
        const existing = await existingFile(target, file.path);
        let previous: string | null = null;
        if (existing) {
          const disk = await existing.getFile();
          if (disk.size > MAX_HTML_BYTES) throw new Error(`${file.path} is too large to back up. Choose a different file name.`);
          previous = await disk.text();
        }
        const hash = await fingerprint(file.content);
        if (previous !== null && previous !== file.content && !html) {
          const expected = fingerprints[keyOf(file.path)];
          if (!expected || await fingerprint(previous) !== expected) throw new Error(`${file.path} already exists or was edited outside Canvas. Your PC version was preserved. Rename the generated file or choose another folder.`);
        }
        prepared.push({ file, previous, hash });
      }
      for (const { file, previous, hash } of prepared) {
        guard();
        // Recheck after preparation: an editor may have saved while another file was being checked.
        const current = await existingFile(target, file.path);
        const currentFile = current ? await current.getFile() : null;
        if (currentFile && currentFile.size > MAX_HTML_BYTES) throw new Error(`${file.path} changed on your PC while saving. Your PC version was preserved.`);
        const currentText = currentFile ? await currentFile.text() : null;
        if (currentText !== previous && currentText !== file.content) throw new Error(`${file.path} changed on your PC while saving. Your PC version was preserved.`);
        if (currentText !== file.content) {
          if (currentText !== null) {
            const backups = await target.getDirectoryHandle('.ahpah-backups', { create: true });
            const backupPath = `${file.path}.${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.previous`;
            const backup = await directoryFor(backups, backupPath, true);
            await writeContent(await backup.directory.getFileHandle(backup.filename, { create: true }), currentText, session, signal, isCurrent);
          }
          const destination = await directoryFor(target, file.path, true);
          await writeContent(current ?? await destination.directory.getFileHandle(destination.filename, { create: true }), file.content, session, signal, isCurrent);
        }
        saved.push(`${target.name}/${file.path}`);
        // A completed close is a real disk save, even if the connection changed meanwhile.
        checkActive(session);
        fingerprints[keyOf(file.path)] = hash;
        try { await persistConnection(); } catch { if (session === generation) update({ error: 'File saved. Browser storage could not remember its conflict protection for the next session.' }); }
        if (session === generation) update({ lastSaved: saved.at(-1)! });
      }
      if (session === generation) update({ status: 'connected' });
      return saved;
    } catch (error) {
      const original = error instanceof Error ? error.message : 'The files could not be written to your PC.';
      const message = `${original}${saved.length ? ` ${saved.length} of ${files.length} files were saved before the operation stopped: ${saved.join(', ')}.` : ' No source file writes were confirmed.'}`;
      if (session === generation) update({ status: state.status === 'permission' || permissionError(error) ? 'permission' : 'connected', error: message });
      if (signal?.aborted) throw signal.reason ?? new DOMException('Saving was cancelled.', 'AbortError');
      throw new Error(message);
    }
  });
  writeQueue = operation;
  return operation;
}
export async function saveFilesToFolder(files: EngineeringFile[], signal?: AbortSignal): Promise<string[]> {
  const validated = validateProjectFiles(files);
  if (!validated.length) throw new Error('No source files were provided to save.');
  if (['connected', 'saving'].includes(state.status)) await supersedePending(validated, signal);
  return saveFiles(validated, false, signal);
}
export async function saveHtmlToFolder(artifact: HtmlArtifact, signal?: AbortSignal): Promise<string> {
  const file = htmlFile(artifact);
  if (['connected', 'saving'].includes(state.status)) await supersedePending([file], signal);
  return (await saveFiles([file], true, signal))[0];
}
async function supersedePending(files: EngineeringFile[], signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!files.some(file => pending.has(keyOf(file.path)))) return;
  const replacedGroups = new Set<string>();
  await mutatePending(next => {
    for (const file of files) {
      const previous = next.get(keyOf(file.path));
      if (previous) replacedGroups.add(previous.group);
      next.delete(keyOf(file.path));
    }
  }, signal);
  replacedGroups.forEach(forgetGroup);
}
async function enqueue(files: EngineeringFile[], html: boolean, onSaved?: (destinations: string[]) => void, signal?: AbortSignal): Promise<FolderSaveResult> {
  signal?.throwIfAborted();
  const group = crypto.randomUUID();
  const replacedGroups = new Set<string>();
  try {
    await mutatePending(next => {
      for (const file of files) {
        const replaced = next.get(keyOf(file.path));
        if (replaced) replacedGroups.add(replaced.group);
        next.set(keyOf(file.path), { ...file, group, html });
      }
      if (next.size > 210 || [...next.values()].reduce((size, file) => size + encoder.encode(file.content).byteLength, 0) > MAX_PENDING_BYTES) throw new Error('The pending folder queue is full. Connect your folder to save existing files before creating more.');
    }, signal);
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(error instanceof Error ? error.message : 'Browser storage could not keep these files for automatic saving. Their source remains in Canvas; connect a folder and retry.');
  }
  if (signal?.aborted) {
    await mutatePending(next => { for (const [key, file] of next) if (file.group === group) next.delete(key); });
    signal.throwIfAborted();
  }
  replacedGroups.forEach(forgetGroup);
  // The durable queue owns completed source now. Later timeout/navigation aborts of the
  // generation must not discard ready files that were successfully handed off here.
  groups.set(group, { remaining: new Set(files.map(file => keyOf(file.path))), destinations: [], onSaved });
  if (['connected', 'saving'].includes(state.status)) void flushPendingFiles();
  return { saved: false, reason: state.status === 'permission' ? 'Reconnect your folder. These files are kept on this device and will save automatically.' : ['connected', 'saving'].includes(state.status) ? 'Files are queued on this device. Check the connected folder panel for automatic saving status.' : 'Connect a folder. These files are kept on this device and will save automatically.' };
}
export async function autoSaveFilesToFolder(files: EngineeringFile[], onSaved?: (destinations: string[]) => void, signal?: AbortSignal): Promise<FolderSaveResult> {
  const validated = validateProjectFiles(files);
  if (!validated.length) throw new Error('No source files were provided to save.');
  await restoreConnectedFolder(); signal?.throwIfAborted();
  if (['connected', 'saving'].includes(state.status)) {
    try { await supersedePending(validated, signal); return { saved: true, destinations: await saveFiles(validated, false, signal) }; }
    catch (error) { if (state.status !== 'permission' || signal?.aborted) throw error; }
  }
  return enqueue(validated, false, onSaved, signal);
}
export async function autoSaveHtmlToFolder(artifact: HtmlArtifact, onSaved?: (destination: string) => void, signal?: AbortSignal): Promise<{ saved: true; destination: string } | { saved: false; reason: string }> {
  const file = htmlFile(artifact);
  await restoreConnectedFolder(); signal?.throwIfAborted();
  if (['connected', 'saving'].includes(state.status)) {
    try { await supersedePending([file], signal); return { saved: true, destination: (await saveFiles([file], true, signal))[0] }; }
    catch (error) { if (state.status !== 'permission' || signal?.aborted) throw error; }
  }
  return enqueue([file], true, destinations => onSaved?.(destinations[0]), signal) as Promise<{ saved: false; reason: string }>;
}
export function flushPendingFiles(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const [key, queued] of pending) {
      if (!['connected', 'saving'].includes(state.status)) break;
      try {
        const destinations = await saveFiles([{ path: queued.path, content: queued.content }], queued.html, undefined, () => pending.get(key) === queued);
        if (pending.get(key) !== queued) continue;
        await mutatePending(next => { if (next.get(key) === queued) next.delete(key); });
        const group = groups.get(queued.group);
        if (group) {
          group.remaining.delete(key); group.destinations.push(...destinations);
          if (!group.remaining.size) {
            forgetGroup(queued.group);
            try { group.onSaved?.(group.destinations); } catch { /* UI callbacks cannot change a successful disk write. */ }
          }
        }
      } catch (error) {
        if (pending.get(key) !== queued) continue;
        if (!state.error) update({ error: error instanceof Error ? error.message : 'The queued file could not be saved. Its source remains on this device.' });
        break; /* Keep failed and unwritten source in the durable queue. */
      }
    }
  })().finally(() => { flushing = undefined; });
  return flushing;
}
