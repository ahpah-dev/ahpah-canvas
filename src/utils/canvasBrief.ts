import type { CanvasCard, Connection, TerminalLine } from '../types/canvas.ts';
import { cardName, statusName } from './cardPresentation.ts';

export interface CanvasBriefOptions {
  generatedAt?: Date;
  /** Most recent activity lines kept for each agent. */
  recentLines?: number;
}

const DEFAULT_RECENT_LINES = 8;
const MAX_LINE_LENGTH = 220;

const oneLine = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_LINE_LENGTH ? `${flat.slice(0, MAX_LINE_LENGTH - 1)}…` : flat;
};

// Multi-line text is quoted so headings or lists inside it cannot break the brief's structure.
const quote = (text: string) => text.trim().split('\n').map(line => `> ${line}`.trimEnd()).join('\n');

const activityLabel: Record<TerminalLine['type'], string> = {
  input: 'You',
  output: 'Agent',
  system: 'System',
  error: 'Error',
  success: 'Done',
  plan: 'Plan',
  diff: 'Diff',
  route: 'Route',
  tool: 'Tool',
};

const byReadingOrder = (a: CanvasCard, b: CanvasCard) => a.y - b.y || a.x - b.x;

/**
 * Builds a Markdown handoff of the canvas: agents with their status, the work in progress,
 * recent activity and connections, followed by notes, previews, and scratchpads.
 * Reads only what the canvas already shows, so no credentials or request state are included.
 */
export function buildCanvasBrief(cards: CanvasCard[], connections: Connection[], options: CanvasBriefOptions = {}): string {
  const recentLines = options.recentLines ?? DEFAULT_RECENT_LINES;
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const ordered = [...cards].sort(byReadingOrder);
  const names = new Map(cards.map(card => [card.id, cardName(card)]));
  const agents = ordered.filter(card => card.type === 'agent');
  const notes = ordered.filter(card => card.type === 'note');
  const previews = ordered.filter(card => card.type === 'browser');
  const scratchpads = ordered.filter(card => card.type === 'terminal');

  const lines: string[] = [
    '# Canvas brief',
    '',
    `Generated ${generatedAt} · ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'} · ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} · ${connections.length} ${connections.length === 1 ? 'connection' : 'connections'}`,
  ];

  if (!cards.length) {
    lines.push('', 'The canvas is empty.');
    return `${lines.join('\n')}\n`;
  }

  if (agents.length) {
    lines.push('', '## Agents');
    for (const agent of agents) {
      const linked = [...new Set(connections.flatMap(connection => {
        if (connection.fromCardId === agent.id) return [connection.toCardId];
        if (connection.toCardId === agent.id) return [connection.fromCardId];
        return [];
      }).map(id => names.get(id)).filter((name): name is string => Boolean(name)))];
      const recent = agent.history.slice(-recentLines).filter(line => line.text.trim());

      lines.push('', `### ${cardName(agent)}`);
      lines.push(`- **Status:** ${statusName(agent)}`);
      const model = agent.routedModel || agent.providerName || agent.agentType;
      if (model) lines.push(`- **Model:** ${model}`);
      if (agent.role) lines.push(`- **Role:** ${oneLine(agent.role)}`);
      if (agent.lastAction) lines.push(`- **Last action:** ${oneLine(agent.lastAction)}`);
      if (linked.length) lines.push(`- **Connected to:** ${linked.join(', ')}`);
      if (agent.agentInstructions?.trim()) lines.push('- **Instructions:**', quote(agent.agentInstructions));
      if (agent.currentPrompt?.trim()) lines.push('- **Working on:**', quote(agent.currentPrompt));
      if (recent.length) {
        lines.push('- **Recent activity:**');
        for (const line of recent) lines.push(`  - ${activityLabel[line.type]}: ${oneLine(line.text)}`);
      }
    }
  }

  if (notes.length) {
    lines.push('', '## Notes');
    for (const note of notes) {
      lines.push('', `### ${cardName(note)}`, '', (note.noteContent ?? '').trim() || '_Empty note._');
    }
  }

  if (previews.length || scratchpads.length) {
    lines.push('', '## Tools');
    for (const preview of previews) lines.push(`- Browser preview · ${cardName(preview)}${preview.browserUrl ? `: ${preview.browserUrl}` : ''}`);
    for (const pad of scratchpads) lines.push(`- Command scratchpad · ${cardName(pad)}${pad.cliCommand ? `: \`${pad.cliCommand.replace(/`/g, '')}\`` : ''}`);
  }

  if (connections.length) {
    lines.push('', '## Connections');
    for (const connection of connections) {
      const from = names.get(connection.fromCardId);
      const to = names.get(connection.toCardId);
      if (!from || !to) continue;
      lines.push(`- ${from} → ${to}${connection.label ? ` (${oneLine(connection.label)})` : ''}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
