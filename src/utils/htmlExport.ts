import type { EngineeringFile } from '../types/engineering.ts';
import { buildProjectHtml } from './projectFiles.ts';

export interface HtmlArtifact { html: string; filename: string; title: string }
export class MissingHtmlArtifactError extends Error {
  constructor(name?: string) { super(name ? `No complete HTML source for “${name}” was returned.` : 'No complete HTML source was returned.'); this.name = 'MissingHtmlArtifactError'; }
}

export function requestsHtmlCreation(prompt: string): boolean {
  return /\b(?:create|build|make|develop|generate|write|implement|finish|fix|update)\b/i.test(prompt) && /\b(?:html|game|website|webpage|web page|three\.js|arena shooter)\b/i.test(prompt) && !/\b(?:python|unity|unreal|godot|java|c\+\+)\b/i.test(prompt);
}

export const refusesHtmlSave = (prompt: string): boolean => /\b(?:do not|don't|never|without)\s+(?:automatically\s+)?(?:export|download|save|saving)\b/i.test(prompt);

export function htmlFilename(name: string): string {
  // oxlint-disable-next-line no-control-regex -- Windows filenames cannot contain control characters.
  const clean = name.replace(/\.html?$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 100);
  return `${!clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? 'game' : clean}.html`;
}

export function htmlTitle(html: string): string {
  return /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() || 'game';
}

export function requestsHtmlExport(prompt: string): boolean {
  if (!/\bhtml\b/i.test(prompt) || /\b(?:do not|don't|never)\s+(?:export|download|save)\b/i.test(prompt)) return false;
  return /\b(?:export|download)\b/i.test(prompt) || /\bsave\s+(?:it|this|(?:the|my)\s+(?:game|project|file|html)|(?:as\s+)?html|["“'])/i.test(prompt) || /\bsave\b[^\n]*\b(?:to|into|in)\s+(?:(?:my|the|a|your|our|this|connected)\s+)?(?:pc|computer|folder|directory)\b/i.test(prompt);
}

export function completeHtml(text: string): boolean {
  return /^(?:\s*<!doctype\s+html[^>]*>)?\s*<html\b/i.test(text) && /<\/html\s*>\s*$/i.test(text);
}

// Only intercept direct export requests, leaving requests to build/edit to the agent.
export function htmlExportRequest(prompt: string): { name?: string } | null {
  if (!/^(?:(?:please|can you|could you|would you|i want you to)\s+)*(?:export|download|save)\b/i.test(prompt.trim()) || !requestsHtmlExport(prompt) || /\b(?:create|build|modify|change|implement|rewrite)\b/i.test(prompt)) return null;
  const quoted = /["“]([^"”]+)["”]|'([^']+)'/.exec(prompt);
  const named = /\b(?:game|project|file)\s+([\w .-]+?)\s+(?:to|as|in)\b/i.exec(prompt)?.[1];
  const filename = /\b([^\s<>:"/\\|?*]+\.html?)\b/i.exec(prompt)?.[1];
  const name = quoted?.[1] || quoted?.[2] || filename || named;
  return name && !/^(?:the|this|my|current|our)$/i.test(name.trim()) ? { name: name.trim().replace(/\.html?$/i, '') } : {};
}

export function conversationHtml(history: { type: string; text: string }[], name?: string): HtmlArtifact {
  const artifacts: (HtmlArtifact & { context: string })[] = [];
  let request = '';
  for (const line of history) {
    if (line.type === 'input') { request = line.text; continue; }
    if (line.type !== 'output') continue;
    // Providers sometimes omit the final Markdown fence even when </html> is complete.
    const blocks = [...line.text.matchAll(/```[^\n`]*\n([\s\S]*?)(?:```|$)/gi)].map(match => match[1]);
    if (completeHtml(line.text)) blocks.push(line.text);
    if (!blocks.some(completeHtml)) {
      const rawDocument = /(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*<\/html\s*>/i.exec(line.text)?.[0];
      if (rawDocument) blocks.push(rawDocument);
    }
    for (const html of blocks) {
      if (!completeHtml(html)) continue;
      const title = htmlTitle(html);
      artifacts.push({ html, title, filename: htmlFilename(title), context: `${request}\n${line.text.replace(/```[\s\S]*?```/g, '')}` });
    }
  }
  const normalized = name?.toLowerCase().trim();
  const pattern = normalized ? new RegExp(`(?:^|[^\\w])${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\w])`, 'i') : null;
  const artifact = pattern ? artifacts.findLast(item => pattern.test(item.title)) ?? artifacts.findLast(item => pattern.test(item.context)) : artifacts.at(-1);
  if (!artifact) throw new MissingHtmlArtifactError(name);
  return projectHtmlArtifact([{ path: 'index.html', content: artifact.html }], 'index.html', name || artifact.title);
}

export function projectHtmlArtifact(files: EngineeringFile[], entry: string, name?: string): HtmlArtifact {
  const result = buildProjectHtml(files, entry);
  if (!result.html || result.issues.length) throw new Error(`Cannot export a complete HTML file: ${result.issues.join(' ')}`);
  const title = htmlTitle(result.html);
  return { html: result.html, title, filename: htmlFilename(name || title) };
}

