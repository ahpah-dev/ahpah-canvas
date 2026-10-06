import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { highlightSource, sourceLanguage } from '../../utils/sourceHighlight';
import { findSourceMatches, markSourceMatches, normalizeEditorSource, replaceSourceMatches, type SourceMatch } from './editorSearch';

export function SourceEditor({ path, value, disabled, onChange, saveNote, findRequest = 0, onFindRequestHandled }: {
  path: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => boolean | void;
  saveNote: string;
  findRequest?: number;
  onFindRequestHandled?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);
  const [replaceNote, setReplaceNote] = useState('');
  const [lastReplacement, setLastReplacement] = useState<{ before: string; after: string } | null>(null);
  const language = sourceLanguage(path);
  const editorValue = useMemo(() => normalizeEditorSource(value), [value]);
  const tokens = useMemo(() => highlightSource(editorValue, language), [editorValue, language]);
  const totalLines = useMemo(() => editorValue.split('\n').length, [editorValue]);
  const lineNumbers = useMemo(() => Array.from({ length: Math.min(totalLines, 10000) }, (_, index) => index + 1).join('\n'), [totalLines]);
  const matches = useMemo(() => findOpen ? findSourceMatches(editorValue, query, matchCase) : [], [findOpen, editorValue, query, matchCase]);
  const currentIndex = Math.min(activeMatch, Math.max(0, matches.length - 1));
  const markedTokens = useMemo(() => markSourceMatches(tokens, matches, currentIndex), [tokens, matches, currentIndex]);

  const trackCursor = (input: HTMLTextAreaElement) => {
    const preceding = input.value.slice(0, input.selectionStart);
    const line = preceding.split('\n').length;
    const column = preceding.length - preceding.lastIndexOf('\n');
    setCursor(previous => previous.line === line && previous.column === column ? previous : { line, column });
    root.current?.style.setProperty('--eng-active-line', `${20 + (line - 1) * 24 - input.scrollTop}px`);
  };

  const syncScroll = (input: HTMLTextAreaElement) => {
    if (gutter.current) gutter.current.scrollTop = input.scrollTop;
    if (mirror.current) mirror.current.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
    trackCursor(input);
  };

  const selectMatch = (match: SourceMatch | undefined, focus = false) => {
    const input = inputRef.current;
    if (!input || !match) return;
    if (focus) input.focus();
    input.setSelectionRange(match.start, match.end);
    const preceding = input.value.slice(0, match.start);
    const line = preceding.split('\n').length;
    const column = preceding.length - preceding.lastIndexOf('\n');
    const lineTop = 20 + (line - 1) * 24;
    if (lineTop < input.scrollTop + 20 || lineTop + 24 > input.scrollTop + input.clientHeight) input.scrollTop = Math.max(0, lineTop - input.clientHeight / 2);
    const lineText = preceding.slice(preceding.lastIndexOf('\n') + 1);
    let expandedLine = '';
    for (const character of lineText) expandedLine += character === '\t' ? ' '.repeat(2 - expandedLine.length % 2) : character;
    const measurement = document.createElement('canvas').getContext('2d');
    if (measurement) measurement.font = getComputedStyle(input).font;
    const columnLeft = 22 + (measurement?.measureText(expandedLine).width ?? (column - 1) * 7.8);
    if (columnLeft < input.scrollLeft + 22 || columnLeft > input.scrollLeft + input.clientWidth - 22) input.scrollLeft = Math.max(0, columnLeft - input.clientWidth / 2);
    syncScroll(input);
  };

  const openFind = (replace = false) => {
    const input = inputRef.current;
    const selection = input?.value.slice(input.selectionStart, input.selectionEnd) ?? '';
    if (selection && !selection.includes('\n') && selection.length <= 240) {
      setQuery(selection);
      const selectedMatches = findSourceMatches(editorValue, selection, matchCase);
      setActiveMatch(Math.max(0, selectedMatches.findIndex(match => match.start === input?.selectionStart)));
    }
    setFindOpen(true);
    if (replace) setReplaceOpen(true);
    setReplaceNote('');
    requestAnimationFrame(() => { findInput.current?.focus(); findInput.current?.select(); });
  };

  const openFindRef = useRef(openFind);
  useEffect(() => { openFindRef.current = openFind; });
  useEffect(() => { if (findRequest) { openFindRef.current(); onFindRequestHandled?.(); } }, [findRequest, onFindRequestHandled]);

  const changeSearch = (nextQuery: string, nextCase = matchCase) => {
    setQuery(nextQuery); setMatchCase(nextCase); setActiveMatch(0); setReplaceNote('');
    selectMatch(findSourceMatches(editorValue, nextQuery, nextCase)[0]);
  };

  const navigateMatch = (direction: number) => {
    if (!matches.length) return;
    const next = (currentIndex + direction + matches.length) % matches.length;
    setActiveMatch(next); setReplaceNote(''); selectMatch(matches[next]);
  };

  const closeFind = () => {
    setFindOpen(false); setReplaceNote('');
    inputRef.current?.focus();
  };

  const replaceMatches = (all = false) => {
    if (disabled || !matches.length) return;
    const affected = all ? matches : [matches[currentIndex]];
    const next = replaceSourceMatches(editorValue, affected, replacement);
    if (onChange(next) === false) { setReplaceNote('Replacement could not be saved. Read the project message.'); return; }
    setLastReplacement({ before: value, after: next });
    setReplaceNote(`Replaced ${affected.length.toLocaleString()} ${affected.length === 1 ? 'match' : 'matches'}.`);
    const nextMatches = findSourceMatches(next, query, matchCase);
    const nextIndex = all ? 0 : nextMatches.findIndex(match => match.start >= affected[0].start + replacement.length);
    setActiveMatch(Math.max(0, nextIndex));
    requestAnimationFrame(() => {
      if (nextMatches.length) selectMatch(nextMatches[Math.max(0, nextIndex)]);
      else if (inputRef.current) { inputRef.current.setSelectionRange(affected[0].start, affected[0].start + replacement.length); syncScroll(inputRef.current); }
    });
  };

  return <>
    {findOpen && <div className="eng-find-toolbar" role="region" aria-label="Find and replace in the current file" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeFind(); }
      else if ((event.metaKey || event.ctrlKey) && ['f', 'h'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); openFind(event.key.toLowerCase() === 'h'); }
    }}>
      <div className="eng-find-row"><button type="button" className="eng-find-case" aria-label={replaceOpen ? 'Hide replace controls' : 'Show replace controls'} aria-expanded={replaceOpen} onClick={() => setReplaceOpen(previous => !previous)}>{replaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><label className="eng-find-field"><Search size={13} aria-hidden="true" /><input ref={findInput} aria-label="Find in current file" placeholder="Find in file" value={query} maxLength={1000} onChange={event => changeSearch(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); navigateMatch(event.shiftKey ? -1 : 1); }
      }} /></label><button type="button" className={`eng-find-case${matchCase ? ' is-active' : ''}`} aria-label="Match case" aria-pressed={matchCase} title="Match case" onClick={() => changeSearch(query, !matchCase)}>Aa</button><span className="eng-find-count" role="status">{query ? matches.length ? `${currentIndex + 1} of ${matches.length.toLocaleString()}` : 'No matches' : 'Find text'}</span><div className="eng-find-actions"><button type="button" aria-label="Previous match" title="Previous match (Shift Enter)" disabled={!matches.length} onClick={() => navigateMatch(-1)}><ArrowUp size={14} /></button><button type="button" aria-label="Next match" title="Next match (Enter)" disabled={!matches.length} onClick={() => navigateMatch(1)}><ArrowDown size={14} /></button><button type="button" aria-label="Close find" title="Close find (Escape)" onClick={closeFind}><X size={14} /></button></div></div>
      {replaceOpen && <div className="eng-replace-row"><label className="eng-find-field"><input aria-label="Replace with" placeholder="Replace with" value={replacement} onChange={event => { setReplacement(event.target.value); setReplaceNote(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); replaceMatches(); } }} disabled={disabled} /></label><button type="button" className="eng-button" disabled={disabled || !matches.length} onClick={() => replaceMatches()}>Replace</button><button type="button" className="eng-button" disabled={disabled || !matches.length} onClick={() => replaceMatches(true)}>Replace all</button>{lastReplacement && <button type="button" className="eng-button" title={value === lastReplacement.after ? 'Restore the content before the last replacement' : 'The file changed after replacement'} disabled={disabled || value !== lastReplacement.after} onClick={() => { if (value !== lastReplacement.after || onChange(lastReplacement.before) === false) return; setLastReplacement(null); setReplaceNote('Replacement undone.'); }}>Undo replace</button>}{replaceNote && <span role="status">{replaceNote}</span>}</div>}
    </div>}
    <div ref={root} className="eng-editor eng-source-editor" style={{ '--eng-active-line': '20px' } as CSSProperties}>
      <div className="eng-source-active-line" aria-hidden="true" />
      <pre ref={gutter} className="eng-editor-gutter" aria-hidden="true">{lineNumbers}</pre>
      <div className="eng-source-surface">
        <pre ref={mirror} className="eng-source-highlight" aria-hidden="true">{markedTokens.map((token, index) => <span key={index} className={token.kind ? `eng-token-${token.kind}` : undefined}>{token.match === undefined ? token.text : <mark className={`eng-source-match${token.match === currentIndex ? ' is-active' : ''}`}>{token.text}</mark>}</span>)}{'\n'}</pre>
        <textarea ref={inputRef} className="eng-source-input" aria-label={`Edit ${path}`} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" value={editorValue} disabled={disabled}
          onChange={event => { onChange(event.target.value); trackCursor(event.currentTarget); }}
          onSelect={event => trackCursor(event.currentTarget)}
          onScroll={event => syncScroll(event.currentTarget)}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && ['f', 'h'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); openFind(event.key.toLowerCase() === 'h'); return; }
            if (event.key === 'Escape' && findOpen) { event.preventDefault(); closeFind(); return; }
            if (event.key === 'F3' && query) {
              event.preventDefault();
              if (findOpen) navigateMatch(event.shiftKey ? -1 : 1);
              else { setFindOpen(true); const restoredMatches = findSourceMatches(editorValue, query, matchCase); selectMatch(restoredMatches[Math.min(activeMatch, Math.max(0, restoredMatches.length - 1))], true); }
              return;
            }
            if (event.key !== 'Tab') return;
            event.preventDefault();
            const input = event.currentTarget;
            const start = input.selectionStart;
            onChange(input.value.slice(0, start) + '  ' + input.value.slice(input.selectionEnd));
            requestAnimationFrame(() => { if (!input.isConnected) return; input.selectionStart = input.selectionEnd = start + 2; trackCursor(input); });
          }} />
      </div>
    </div>
    <footer className="eng-editor-footer">
      <span className="eng-editor-status"><span>{language || 'Plain text'}</span><span>{totalLines.toLocaleString()} lines</span><span>Spaces: 2</span></span>
      <button type="button" className="eng-editor-find-trigger" title="Find in file (Ctrl / ⌘ F)" onClick={() => openFind()}><Search size={11} />Find</button>
      <span className="eng-editor-save-note">{saveNote}</span>
      <span className="eng-editor-cursor">Ln {cursor.line}, Col {cursor.column}</span>
    </footer>
  </>;
}
