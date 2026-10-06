import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { highlightSource, sourceLanguage } from '../../utils/sourceHighlight';

export function SourceEditor({ path, value, disabled, onChange, saveNote }: {
  path: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  saveNote: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const language = sourceLanguage(path);
  const tokens = useMemo(() => highlightSource(value, language), [value, language]);
  const lineNumbers = useMemo(() => Array.from({ length: Math.min(value.split('\n').length, 10000) }, (_, index) => index + 1).join('\n'), [value]);

  const trackCursor = (input: HTMLTextAreaElement) => {
    const preceding = input.value.slice(0, input.selectionStart);
    const line = preceding.split('\n').length;
    const column = preceding.length - preceding.lastIndexOf('\n');
    setCursor(previous => previous.line === line && previous.column === column ? previous : { line, column });
    root.current?.style.setProperty('--eng-active-line', `${20 + (line - 1) * 24 - input.scrollTop}px`);
  };

  return <>
    <div ref={root} className="eng-editor eng-source-editor" style={{ '--eng-active-line': '20px' } as CSSProperties}>
      <div className="eng-source-active-line" aria-hidden="true" />
      <pre ref={gutter} className="eng-editor-gutter" aria-hidden="true">{lineNumbers}</pre>
      <div className="eng-source-surface">
        <pre ref={mirror} className="eng-source-highlight" aria-hidden="true">{tokens.map((token, index) => token.kind ? <span key={index} className={`eng-token-${token.kind}`}>{token.text}</span> : token.text)}{'\n'}</pre>
        <textarea className="eng-source-input" aria-label={`Edit ${path}`} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" value={value} disabled={disabled}
          onChange={event => { onChange(event.target.value); trackCursor(event.currentTarget); }}
          onSelect={event => trackCursor(event.currentTarget)}
          onScroll={event => {
            const input = event.currentTarget;
            if (gutter.current) gutter.current.scrollTop = input.scrollTop;
            if (mirror.current) mirror.current.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
            root.current?.style.setProperty('--eng-active-line', `${20 + (cursor.line - 1) * 24 - input.scrollTop}px`);
          }}
          onKeyDown={event => {
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
      <span className="eng-editor-status"><span>{language || 'Plain text'}</span><span>UTF-8</span><span>Spaces: 2</span></span>
      <span className="eng-editor-save-note">{saveNote}</span>
      <span className="eng-editor-cursor">Ln {cursor.line}, Col {cursor.column}</span>
    </footer>
  </>;
}
