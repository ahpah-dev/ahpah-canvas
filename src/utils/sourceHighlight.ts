export type SourceToken = { text: string; kind?: 'comment' | 'string' | 'keyword' | 'number' | 'function' | 'property' | 'tag' | 'punctuation' };

export function sourceLanguage(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return ({ html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', json: 'JSON', md: 'Markdown', py: 'Python', yaml: 'YAML', yml: 'YAML', sh: 'Shell', svg: 'SVG' } as Record<string, string>)[extension] ?? extension.toUpperCase();
}

// Tokens are rendered as React text, so source always stays literal and editable.
export function highlightSource(source: string, language: string): SourceToken[] {
  if (source.length > 50_000) return [{ text: source }];
  const markup = language === 'HTML' || language === 'SVG';
  const css = language === 'CSS' || language === 'SCSS';
  const python = language === 'Python' || language === 'Shell' || language === 'YAML';
  const pattern = markup
    ? /<!--[\s\S]*?-->|<![^>]*>|<\/?[\w:-]+|\b[\w:-]+(?=\s*=)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/?>/g
    : css
      ? /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-fA-F]{3,8}\b|(?:\d*\.)?\d+(?:[a-z%]+)?|[\w-]+(?=\s*:)|[.@][\w-]+|[{}:;,()]/g
      : /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|def|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|of|pass|return|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield|None|True|False)\b|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b|[\w$]+(?=\s*\()|[{}[\]();.,:]/g;
  const tokens: SourceToken[] = [];
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    if (tokens.length > 4000) return [{ text: source }];
    const text = match[0];
    const index = match.index;
    if (index > offset) tokens.push({ text: source.slice(offset, index) });
    let kind: SourceToken['kind'];
    if (text.startsWith('/*') || text.startsWith('<!--') || (!markup && !css && (text.startsWith('//') || (python && text.startsWith('#'))))) kind = 'comment';
    else if (/^["'`]/.test(text)) kind = language === 'JSON' && /^\s*:/.test(source.slice(index + text.length)) ? 'property' : 'string';
    else if (markup) kind = text.startsWith('<') ? 'tag' : text === '>' || text === '/>' ? 'punctuation' : 'property';
    else if (/^(?:\d|\.\d|#[\da-fA-F])/.test(text)) kind = 'number';
    else if (/^[{}[\]();.,:]$/.test(text)) kind = 'punctuation';
    else if (css) kind = text.startsWith('.') || text.startsWith('@') ? 'tag' : 'property';
    else if (/^\s*\(/.test(source.slice(index + text.length))) kind = 'function';
    else if (!text.startsWith('#')) kind = 'keyword';
    tokens.push({ text, kind });
    offset = index + text.length;
  }
  if (offset < source.length) tokens.push({ text: source.slice(offset) });
  return tokens;
}
