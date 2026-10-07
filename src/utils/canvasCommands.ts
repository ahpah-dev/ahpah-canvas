import type { AgentType, CanvasCard, CardType } from '../types/canvas.ts';
import type { EngineeringProvider } from '../types/engineering.ts';
import { cardName } from './cardPresentation.ts';

export type CanvasControlCommand =
  | { kind: 'launch'; cardType: CardType; agentType?: AgentType; providerId?: string; label: string; detail: string }
  | { kind: 'focus'; cardId: string; label: string; detail: string }
  | { kind: 'settings'; label: string; detail: string };
export type CanvasCommand = CanvasControlCommand
  | { kind: 'prompt'; cardId: string; prompt: string; label: string; detail: string }
  | { kind: 'invalid'; label: string; detail: string };

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliases = (card: CanvasCard) => [...new Set([cardName(card), card.title, card.id].filter(Boolean))];
const invalid = (detail: string): CanvasCommand => ({ kind: 'invalid', label: 'Check the command', detail });

function addressedAgent(text: string, cards: CanvasCard[]) {
  const matches = cards.filter(card => card.type === 'agent').flatMap(card => aliases(card).flatMap(alias => {
    const escaped = escapePattern(alias);
    const match = new RegExp(`^(?:"${escaped}"|${escaped})(?=$|[\\s:,])`, 'i').exec(text);
    return match ? [{ card, length: match[0].length }] : [];
  }));
  const longest = Math.max(0, ...matches.map(match => match.length));
  return [...new Map(matches.filter(match => match.length === longest).map(match => [match.card.id, match])).values()];
}

/** Deterministic commands only: parsing never invokes a model or changes the workspace. */
export function resolveCanvasCommand(text: string, cards: CanvasCard[], providers: EngineeringProvider[]): CanvasCommand | null {
  const input = text.trim();
  if (!input) return null;
  const settings = /^\/?(?:settings|setup|open settings|open setup|connect models|configure providers)[.!]?$/i;
  if (settings.test(input)) return { kind: 'settings', label: 'Open connections', detail: 'Configure models in Settings · no model request' };

  const tell = /^(?:\/ask|tell|ask|direct)\s+(.+)$/i.exec(input);
  if (input.startsWith('@') || tell) {
    const address = input.startsWith('@') ? input.slice(1).trimStart() : tell![1];
    const matches = addressedAgent(address, cards);
    if (!matches.length) {
      if (input.startsWith('@') || /^\/ask\b/i.test(input)) return invalid('No agent matches that name. Use the Commands menu to insert an exact name.');
      return null;
    }
    if (matches.length > 1) return invalid('Several agents share that name. Rename an agent or select its exact target from the prompt menu.');
    const { card, length } = matches[0];
    const remainder = address.slice(length).replace(/^[\s:,]+/, '');
    const prompt = tell ? remainder.replace(/^to\s+/i, '') : remainder;
    return { kind: 'prompt', cardId: card.id, prompt, label: `Send to ${cardName(card)}`, detail: prompt ? 'One agent receives your prompt · uses its existing request budget' : 'Write a task after the agent name' };
  }

  const focus = /^\/?(?:focus|show)\s+(.+)$/i.exec(input);
  if (focus) {
    const name = normalize(focus[1].replace(/^"(.*)"$/, '$1'));
    const matches = cards.filter(card => aliases(card).some(alias => normalize(alias) === name));
    if (matches.length > 1) return invalid('Several cards share that name. Give each card a unique name.');
    if (!matches.length) return invalid('No card matches that name. Choose a card from the Commands menu.');
    return { kind: 'focus', cardId: matches[0].id, label: `Focus ${cardName(matches[0])}`, detail: 'Move to the card · no model request' };
  }

  const launch = /^\/?(?:open|launch|add|new)\s+(.+)$/i.exec(input);
  if (launch) {
    const name = normalize(launch[1].replace(/[.!]$/, '').replace(/^"(.*)"$/, '$1'));
    const tools: Record<string, { cardType: CardType; label: string }> = {
      browser: { cardType: 'browser', label: 'browser preview' }, preview: { cardType: 'browser', label: 'browser preview' },
      note: { cardType: 'note', label: 'project notes' }, notes: { cardType: 'note', label: 'project notes' },
      terminal: { cardType: 'terminal', label: 'command scratchpad' },
    };
    if (tools[name]) return { kind: 'launch', ...tools[name], label: `Add ${tools[name].label}`, detail: 'Create and focus a canvas card · no model request' };
    const builtins: Record<string, AgentType> = { codex: 'codex', kilo: 'kilo', 'kilo code': 'kilo', kilocode: 'kilo', 'kilo auto free': 'kilo', omniroute: 'omniroute', 'omni route': 'omniroute' };
    const builtin = builtins[name];
    const exactId = providers.find(provider => normalize(provider.id) === name);
    const matches = exactId ? [exactId] : providers.filter(provider => normalize(provider.label) === name || normalize(provider.model) === name || (name === 'local' && provider.localModel));
    if (matches.length > 1) return invalid('Several models match. Use the provider’s exact name or choose it from the Commands menu.');
    const provider = matches[0] ?? providers.find(provider => provider.id === builtin);
    if (provider || builtin) {
      const agentType = provider?.id.startsWith('custom:') ? 'custom' : builtin ?? provider!.id as AgentType;
      return {
        kind: 'launch', cardType: 'agent', agentType,
        ...(agentType === 'custom' ? { providerId: provider!.id.slice('custom:'.length) } : {}),
        label: `Open ${provider?.label ?? (builtin === 'kilo' ? 'Kilo Auto Free' : builtin === 'codex' ? 'Codex' : 'OmniRoute')}`,
        detail: provider ? `${provider.model} · creates an idle agent, no model request` : 'Creates an idle agent · connect its model in Settings',
      };
    }
    const named = cards.filter(card => aliases(card).some(alias => normalize(alias) === name));
    if (named.length === 1) return { kind: 'focus', cardId: named[0].id, label: `Focus ${cardName(named[0])}`, detail: 'Move to the existing card · no model request' };
    if (named.length > 1) return invalid('Several cards share that name. Give each card a unique name.');
    if (input.startsWith('/') || ['local', 'claude', 'cursor', 'gemini', 'aider', 'grok', 'opencode', 'ollama'].includes(name)) return invalid('That model is not connected. Add its provider in Settings, then open it by its saved name.');
    return null;
  }
  if (input.startsWith('/')) return invalid('Try /open Codex, /focus followed by a card name, /settings, or @Agent Name followed by a task.');
  return null;
}
