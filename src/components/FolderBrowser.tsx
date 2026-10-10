import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight, Download, File, FileCode2, Folder, FolderOpen, Image, Loader2, RefreshCw, Search } from 'lucide-react';
import { listConnectedFolderEntries, readConnectedFolderFile, type ConnectedFolderEntry } from '../utils/connectedFolder';

const PAGE_SIZE = 100;
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024;
const imageFile = (file: globalThis.File) => /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(file.name);
const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} bytes`;

function FolderFilePreview({ entry }: { entry: ConnectedFolderEntry }) {
  const [preview, setPreview] = useState<{ file?: globalThis.File; url?: string; text?: string; image?: boolean; note?: string; error?: string } | null>(null);
  const fileUrl = preview?.url || '';
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    void (async () => {
      try {
        const file = await readConnectedFolderFile(entry.path, controller.signal);
        controller.signal.throwIfAborted();
        url = URL.createObjectURL(file);
        if (imageFile(file)) {
          if (!controller.signal.aborted) setPreview({ file, url, image: file.size <= MAX_IMAGE_PREVIEW_BYTES, note: file.size > MAX_IMAGE_PREVIEW_BYTES ? 'This image is too large for an inline preview. Download it to open locally.' : undefined });
          return;
        }
        if (file.size > MAX_TEXT_PREVIEW_BYTES) {
          if (!controller.signal.aborted) setPreview({ file, url, note: 'This file is too large for a text preview. Download it to open locally.' });
          return;
        }
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
          controller.signal.throwIfAborted();
          setPreview(text.includes('\0') ? { file, url, note: 'Binary file. Download it to open with an app on your PC.' } : { file, url, text });
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!(error instanceof TypeError)) throw error;
          setPreview({ file, url, note: 'Binary or non-UTF-8 file. Download it to open with an app on your PC.' });
        }
      } catch (error) {
        if (!controller.signal.aborted) setPreview({ error: error instanceof Error ? error.message : 'This file could not be opened. Refresh the folder and try again.' });
      }
    })();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [entry.path]);

  return <section className="cw-folder-file-preview" aria-label={`Preview ${entry.path}`}>
    <header><div><FileCode2 size={14} /><strong title={entry.path}>{entry.name}</strong></div>{preview?.file && <a href={fileUrl || undefined} download={entry.name} aria-label={`Download ${entry.name}`}><Download size={13} />Download</a>}</header>
    <div className="cw-folder-preview-content">
      {!preview ? <div className="cw-folder-browser-empty" role="status"><Loader2 size={22} className="cw-folder-spinner" /><span>Opening file…</span></div>
        : preview.error ? <p className="cw-folder-error" role="alert">{preview.error}</p>
        : preview.image && fileUrl ? <img src={fileUrl} alt={entry.name} />
        : preview.text !== undefined ? <pre tabIndex={0} aria-label={`File contents: ${entry.name}`}>{preview.text || '(Empty file)'}</pre>
        : <div className="cw-folder-browser-empty"><File size={26} /><strong>{entry.name}</strong><p>{preview.note}</p></div>}
    </div>
    <footer><span title={entry.path}>{entry.path}</span><span>{preview?.file ? formatBytes(preview.file.size) : ''}</span><span>Read only · kept on your device</span></footer>
  </section>;
}

/** All entries stay browsable. Only a selected file is read; nothing is sent to an agent. */
export function FolderBrowser({ name, contentsRevision }: { name: string; contentsRevision: number }) {
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ConnectedFolderEntry | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [listing, setListing] = useState<{ key: string; entries: ConnectedFolderEntry[]; error?: string } | null>(null);
  const key = JSON.stringify([path, contentsRevision, refresh]);
  const current = listing?.key === key ? listing : null;
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(() => (current?.entries || []).filter(entry => entry.name.toLocaleLowerCase().includes(deferredQuery.trim().toLocaleLowerCase())), [current?.entries, deferredQuery]);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const segments = path ? path.split('/') : [];

  useEffect(() => {
    const controller = new AbortController();
    void listConnectedFolderEntries(path, controller.signal).then(entries => {
      if (!controller.signal.aborted) setListing({ key, entries });
    }).catch(error => {
      if (!controller.signal.aborted) setListing({ key, entries: [], error: error instanceof Error ? error.message : 'Could not list this folder. Reconnect it to restore access.' });
    });
    return () => controller.abort();
  }, [path, key]);

  const navigate = (next: string) => { setPath(next); setQuery(''); setPage(0); setSelected(null); };
  return <div className="cw-folder-browser">
    <div className="cw-folder-browser-toolbar"><nav aria-label="Connected folder location"><button type="button" onClick={() => navigate('')} title={name}><FolderOpen size={14} />{name}</button>{segments.map((segment, index) => <span key={segments.slice(0, index + 1).join('/')}><ChevronRight size={11} /><button type="button" onClick={() => navigate(segments.slice(0, index + 1).join('/'))}>{segment}</button></span>)}</nav><div><button type="button" disabled={!path} onClick={() => navigate(segments.slice(0, -1).join('/'))} aria-label="Go to parent folder" title="Parent folder"><ArrowUp size={14} /></button><button type="button" onClick={() => setRefresh(previous => previous + 1)} aria-label="Refresh connected folder files" title="Refresh files"><RefreshCw size={14} /></button></div></div>
    <div className="cw-folder-browser-panes">
      <section className="cw-folder-browser-list" aria-label="Files in connected folder">
        <label className="cw-folder-browser-search"><Search size={13} /><input type="search" placeholder="Search this folder…" aria-label="Search connected folder entries" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <div className="cw-folder-entry-list" aria-busy={!current}>
          {!current ? <div className="cw-folder-browser-empty" role="status"><Loader2 size={20} className="cw-folder-spinner" /><span>Reading folder…</span></div>
            : current.error ? <p className="cw-folder-error" role="alert">{current.error}</p>
            : visible.length ? visible.map(entry => <button type="button" key={entry.path} title={entry.path} className={selected?.path === entry.path ? 'is-selected' : ''} aria-current={selected?.path === entry.path ? 'true' : undefined} onClick={() => entry.kind === 'directory' ? navigate(entry.path) : setSelected(entry)}>{entry.kind === 'directory' ? <Folder size={15} /> : /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(entry.name) ? <Image size={15} /> : <File size={15} />}<span>{entry.name}</span>{entry.kind === 'directory' && <ChevronRight size={12} />}</button>)
            : <p className="cw-folder-browser-empty" role="status">{query ? 'No matching entries in this folder.' : 'This folder is empty.'}</p>}
        </div>
        <footer><span>{current ? `${matches.length} ${matches.length === 1 ? 'entry' : 'entries'}` : 'Loading…'}</span>{pageCount > 1 && <div><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous files page"><ChevronLeft size={13} /></button><small>{currentPage + 1}/{pageCount}</small><button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label="Next files page"><ChevronRight size={13} /></button></div>}</footer>
      </section>
      {selected ? <FolderFilePreview key={`${selected.path}:${contentsRevision}:${refresh}`} entry={selected} /> : <section className="cw-folder-file-preview cw-folder-browser-empty"><FolderOpen size={30} /><h3>Your files, right here.</h3><p>Open a folder to browse it, or select a file to preview. All entries are listed, including images and hidden files.</p><small>Browsing never adds file contents to model requests.</small></section>}
    </div>
  </div>;
}
