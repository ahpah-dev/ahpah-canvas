import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, FolderOpen, Loader2, Unplug, X } from 'lucide-react';
import { connectFolder, disconnectFolder, folderSnapshot, restoreConnectedFolder, subscribeFolder } from '../utils/connectedFolder';
import { useDialogFocus } from '../utils/useDialogFocus';

export function FolderConnection() {
  const state = useSyncExternalStore(subscribeFolder, folderSnapshot);
  const [open, setOpen] = useState(false);
  useEffect(() => { void restoreConnectedFolder(); }, []);
  useDialogFocus(open, () => setOpen(false));
  const connected = state.status === 'connected' || state.status === 'saving';
  return <>
    <button className={`cw-folder-button ${connected ? 'is-connected' : ''}`} onClick={() => setOpen(true)} aria-label={connected ? `Connected folder: ${state.name}` : 'Connect a folder'} title={connected ? `Exports save automatically into ${state.name}` : 'Connect a folder on your PC'}>
      {state.status === 'saving' ? <Loader2 size={14} className="cw-folder-spinner" /> : <FolderOpen size={14} />}<span>{connected ? state.name : state.status === 'permission' ? 'Reconnect folder' : 'Connect folder'}</span><ChevronDown size={11} />
    </button>
    {open && <div className="cw-folder-backdrop" onClick={() => setOpen(false)}><section className="cw-folder-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-title" onClick={event => event.stopPropagation()}>
      <button className="cw-folder-close" aria-label="Close folder connection" onClick={() => setOpen(false)}><X size={18} /></button>
      <span className="cw-folder-icon"><FolderOpen size={25} /></span><h2 id="folder-title">Your canvas. Your folder.</h2>
      <p>Connect a folder on your PC. When you ask to export HTML, Canvas writes the file straight into that folder.</p>
      <div className="cw-folder-destination"><small>EXPORT DESTINATION</small><strong>{state.name || 'Choose a local folder'}</strong><span>{connected ? 'Connected · automatic exports enabled' : state.status === 'permission' ? 'Reconnect to restore write permission' : 'Browser permission required once you choose a folder'}</span></div>
      {state.lastSaved && <p className="cw-folder-saved"><Check size={14} />Saved {state.lastSaved}</p>}
      <p className="cw-folder-hint">Your connection is remembered on this device. Replacing an HTML file keeps its previous version as .previous.html.</p>
      {!state.supported && <p role="status" className="cw-folder-error">Folder access requires desktop Chrome or Edge. Open this site there to connect your PC folder.</p>}
      {state.error && <p role="status" className="cw-folder-error">{state.error}</p>}
      <div className="cw-folder-actions">{state.name && <button onClick={() => void disconnectFolder()} disabled={state.status === 'connecting' || state.status === 'saving'}><Unplug size={14} />Disconnect</button>}<button className="cw-folder-primary" onClick={() => void connectFolder(connected)} disabled={!state.supported || state.status === 'connecting' || state.status === 'saving'}>{state.status === 'connecting' ? <Loader2 size={14} className="cw-folder-spinner" /> : <FolderOpen size={14} />}{connected ? 'Change folder' : state.status === 'permission' ? 'Reconnect folder' : 'Choose folder'}</button></div>
    </section></div>}
  </>;
}
