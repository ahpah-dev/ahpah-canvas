import type { SourceToken } from '../../utils/sourceHighlight';

export interface SourceMatch { start: number; end: number }
export type SearchToken = SourceToken & { match?: number };

// Native textareas normalize CRLF and CR; use the same text for mirror and search offsets.
export function normalizeEditorSource(source: string): string { return source.replace(/\r\n?/g, '\n'); }

/** Literal searches keep their original UTF-16 offsets, including Unicode case matches. */
export function findSourceMatches(source: string, query: string, matchCase = false): SourceMatch[] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, matchCase ? 'g' : 'gi');
  return Array.from(source.matchAll(pattern), match => ({ start: match.index, end: match.index + match[0].length }));
}

/** Build from original offsets so replacement text and newly inserted matches stay literal. */
export function replaceSourceMatches(source: string, matches: SourceMatch[], replacement: string): string {
  let offset = 0;
  const parts: string[] = [];
  for (const match of matches) {
    parts.push(source.slice(offset, match.start), replacement);
    offset = match.end;
  }
  parts.push(source.slice(offset));
  return parts.join('');
}

/** Split syntax tokens without adding characters or changing the editor mirror's spacing. */
export function markSourceMatches(tokens: SourceToken[], matches: SourceMatch[], activeIndex: number): SearchToken[] {
  const visible = matches.length <= 1000
    ? matches.map((match, index) => ({ ...match, index }))
    : matches[activeIndex] ? [{ ...matches[activeIndex], index: activeIndex }] : [];
  if (!visible.length) return tokens;
  const marked: SearchToken[] = [];
  let offset = 0;
  let matchIndex = 0;
  for (const token of tokens) {
    const tokenEnd = offset + token.text.length;
    let cursor = offset;
    while (cursor < tokenEnd) {
      while (matchIndex < visible.length && visible[matchIndex].end <= cursor) matchIndex++;
      const match = visible[matchIndex];
      const inside = match && match.start <= cursor && cursor < match.end;
      const end = match ? Math.min(tokenEnd, inside ? match.end : match.start) : tokenEnd;
      marked.push({ ...token, text: token.text.slice(cursor - offset, end - offset), ...(inside ? { match: match.index } : {}) });
      cursor = end;
    }
    offset = tokenEnd;
  }
  return marked;
}

export interface SearchableCommand { id: string; label: string; detail?: string; keywords?: string }

export function searchWorkspaceCommands<T extends SearchableCommand>(entries: T[], query: string): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter(entry => {
    const searchable = `${entry.label} ${entry.detail ?? ''} ${entry.keywords ?? ''}`.toLowerCase();
    return terms.every(term => searchable.includes(term));
  }).sort((a, b) => {
    const phrase = terms.join(' ');
    const score = (entry: T) => entry.label.toLowerCase() === phrase ? 0 : entry.label.toLowerCase().startsWith(phrase) ? 1 : 2;
    return score(a) - score(b);
  });
}
