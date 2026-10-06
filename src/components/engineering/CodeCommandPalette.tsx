import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import { ArrowRight, FileCode2, Search, X } from 'lucide-react';
import { useDialogFocus } from '../../utils/useDialogFocus';
import { searchWorkspaceCommands, type SearchableCommand } from './editorSearch';

export interface WorkspaceCommand extends SearchableCommand {
  kind: 'action' | 'file';
  icon?: ComponentType<{ size?: number }>;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function CodeCommandPalette({ commands, initialMode, onClose }: {
  commands: WorkspaceCommand[];
  initialMode: 'all' | 'files';
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | 'files' | 'actions'>(initialMode);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();
  const results = useMemo(() => searchWorkspaceCommands(commands.filter(command => mode === 'all' || command.kind === (mode === 'files' ? 'file' : 'action')), query), [commands, mode, query]);
  const currentIndex = Math.min(activeIndex, Math.max(0, results.length - 1));
  const active = results[currentIndex];
  useDialogFocus(true, onClose);

  useEffect(() => {
    document.getElementById(`${listId}-${currentIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex, listId, query, mode]);

  const choose = (command?: WorkspaceCommand) => {
    if (!command || command.disabled) return;
    onClose();
    // Restore the palette trigger before an action opens another dialog or focuses the editor.
    requestAnimationFrame(command.onSelect);
  };

  return <div className="eng-modal-backdrop" onClick={onClose}>
    <section className="eng-modal eng-command-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
      <h2 id={titleId}>Project commands</h2>
      <label className="eng-command-search"><Search size={17} aria-hidden="true" /><input ref={searchInput} autoFocus aria-label="Search files and project commands" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={active ? `${listId}-${currentIndex}` : undefined} placeholder={mode === 'files' ? 'Open a file by name or path…' : 'Search files and commands…'} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (results.length) setActiveIndex((currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
        } else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
        else if (event.key === 'Home' && !query) { event.preventDefault(); setActiveIndex(0); }
        else if (event.key === 'End' && !query) { event.preventDefault(); setActiveIndex(Math.max(0, results.length - 1)); }
      }} /><button type="button" aria-label="Close command palette" onClick={onClose}><X size={16} /></button></label>
      <div className="eng-command-filters" role="group" aria-label="Command search filter">{(['all', 'files', 'actions'] as const).map(filter => <button type="button" key={filter} aria-pressed={mode === filter} onClick={() => { setMode(filter); setActiveIndex(0); searchInput.current?.focus(); }}>{filter === 'all' ? 'All' : filter === 'files' ? 'Files' : 'Actions'}</button>)}<span aria-live="polite">{results.length} results</span></div>
      <div className="eng-command-results" id={listId} role="listbox" aria-label="Matching files and commands">{results.map((command, index) => {
        const Icon = command.icon ?? FileCode2;
        return <div key={command.id} id={`${listId}-${index}`} role="option" aria-selected={index === currentIndex} aria-disabled={command.disabled || undefined} className={`eng-command-result${index === currentIndex ? ' is-active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(command)}><Icon size={15} /><span className="eng-command-result-copy"><strong>{command.label}</strong><small>{command.detail ?? (command.kind === 'file' ? 'Open source file' : 'Project action')}</small></span>{command.shortcut ? <kbd className="eng-command-shortcut">{command.shortcut}</kbd> : <ArrowRight size={13} />}</div>;
      })}</div>
      {!results.length && <div className="eng-command-empty" role="status">No matches. Try a file name or a command like “preview”.</div>}
      <footer className="eng-command-footer"><span>↑ ↓ navigate · Enter open · Esc close</span><span>Ctrl / ⌘ K</span></footer>
    </section>
  </div>;
}
