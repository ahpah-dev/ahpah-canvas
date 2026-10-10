import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, FileCode2, FolderOpen, Loader2, RefreshCw, Trash2, Unplug, X } from 'lucide-react';
import { clearPendingFolderFiles, connectFolder, disconnectFolder, flushPendingFiles, folderSnapshot, restoreConnectedFolder, subscribeFolder } from '../utils/connectedFolder';
import { useDialogFocus } from '../utils/useDialogFocus';
import './folderBrowser.css';

const FolderBrowser = lazy(() => import('./FolderBrowser').then(module => ({ default: module.FolderBrowser })));

export function FolderConnection() {
  const state = useSyncExternalStore(subscribeFolder, folderSnapshot);
  const [open, setOpen] = useState(false);
  useEffect(() => { void restoreConnectedFolder(); }, []);
  useEffect(() => {
    const browse = () => setOpen(true);
    window.addEventListener('ahpah-browse-connected-folder', browse);
    return () => window.removeEventListener('ahpah-browse-connected-folder', browse);
  }, []);
  useDialogFocus(open, () => setOpen(false));
  const connected = state.status === 'connected' || state.status === 'saving';
  return <>
    <button className={`cw-folder-button ${connected ? 'is-connected' : ''}`} onClick={() => setOpen(true)} aria-label={connected ? `Browse connected folder: ${state.name}` : 'Connect a folder'} title={connected ? `Browse files in ${state.name} · automatic saving enabled` : 'Connect a folder on your PC'}>
      {state.status === 'saving' ? <Loader2 size={14} className="cw-folder-spinner" /> : <FolderOpen size={14} />}<span>{connected ? state.name : state.status === 'permission' ? 'Reconnect folder' : 'Connect folder'}</span><ChevronDown size={11} />
    </button>
    {open && <div className="cw-folder-backdrop" onClick={() => setOpen(false)}><section className={`cw-folder-dialog${connected ? ' cw-folder-dialog-browser' : ''}`} role="dialog" aria-modal="true" aria-labelledby="folder-title" onClick={event => event.stopPropagation()}>
      <button className="cw-folder-close" aria-label="Close folder connection" onClick={() => setOpen(false)}><X size={18} /></button>
      <span className="cw-folder-icon"><FolderOpen size={25} /></span><h2 id="folder-title">Your canvas. Your folder.</h2>
      <p>{connected ? 'Browse your real files and subfolders. Select a file to preview it here. Completed Canvas source still saves automatically to this folder.' : 'Connect a folder on your PC to browse its files directly in AhPah. Completed Canvas projects and HTML exports save there automatically.'}</p>
      <div className="cw-folder-destination"><small>LOCAL WORKSPACE</small><strong>{state.name || 'Choose a local folder'}</strong><span>{connected ? 'Connected · automatic file saving enabled' : state.status === 'permission' ? 'Reconnect to restore write permission' : 'Browser permission required once you choose a folder'}</span></div>
      {connected && <Suspense fallback={<p role="status">Opening folder browser…</p>}><FolderBrowser key={state.connectionRevision} name={state.name} contentsRevision={state.contentsRevision} /></Suspense>}
      {state.lastSaved && <p className="cw-folder-saved"><Check size={14} />Saved {state.lastSaved}</p>}
      {state.pendingCount > 0 && <div className="cw-folder-queue">
        <p role="status"><FileCode2 size={15} />{state.pendingCount} {state.pendingCount === 1 ? 'file is' : 'files are'} waiting to save</p>
        <ul>{state.pendingPaths.slice(0, 4).map(path => <li key={path}>{path}</li>)}</ul>
        {state.pendingCount > 4 && <small>And {state.pendingCount - 4} more</small>}
        <span>{state.status === 'saving' ? 'Writing to your PC…' : connected ? 'Files stay queued if a save needs your attention.' : 'Kept on this device across reloads. Connect to save automatically.'}</span>
        <div>{connected && <button onClick={() => void flushPendingFiles()} disabled={state.status === 'saving'}><RefreshCw size={12} />Retry saving</button>}<button onClick={() => void clearPendingFolderFiles()} disabled={state.status === 'connecting' || state.status === 'saving'}><Trash2 size={12} />Clear queue</button></div>
      </div>}
      <p className="cw-folder-hint">Your folder and queued files are remembered on this device. External source edits are preserved. Replaced files keep a version in .ahpah-backups.</p>
      {!state.supported && <p role="status" className="cw-folder-error">Folder access requires desktop Chrome or Edge. Open this site there to connect your PC folder.</p>}
      {state.error && <p role="status" className="cw-folder-error">{state.error}</p>}
      <div className="cw-folder-actions">{state.name && <button onClick={() => void disconnectFolder()} disabled={state.status === 'connecting' || state.status === 'saving'}><Unplug size={14} />Disconnect</button>}<button className="cw-folder-primary" onClick={() => void connectFolder(connected)} disabled={!state.supported || state.status === 'connecting' || state.status === 'saving'}>{state.status === 'connecting' ? <Loader2 size={14} className="cw-folder-spinner" /> : <FolderOpen size={14} />}{connected ? 'Change folder' : state.status === 'permission' ? 'Reconnect folder' : 'Choose folder'}</button></div>
    </section></div>}
  </>;
}
