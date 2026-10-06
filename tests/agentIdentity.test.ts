import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanvasCard } from '../src/types/canvas.ts';
import type { AgentSender } from '../src/types/engineering.ts';
import { agentIdentityInstructions, getAgentIdentity, nextAgentName, normalizeAgentIdentity } from '../src/utils/agentIdentity.ts';
import { cardName } from '../src/utils/cardPresentation.ts';
import { hasSameCardContent } from '../src/utils/cardRendering.ts';
import { validateCards, validateWorkspace } from '../src/utils/workspaceValidation.ts';
import { createDeferredPersistence } from '../src/utils/interactionScheduling.ts';
import { runCanvasAgent, CANVAS_AGENT_INSTRUCTIONS } from '../src/utils/canvasAgentRuntime.ts';
import { createStarterProject } from '../src/utils/projectFiles.ts';

const card: CanvasCard = { id: 'identity-agent', type: 'agent', title: 'Kilo Auto Free', agentType: 'kilo', x: 0, y: 0, width: 500, height: 500, history: [], currentPrompt: '', tokensUsed: 0, cpuPercent: 0, lastAction: '', role: 'Dynamic free model routing' };

test('legacy cards remain valid and get a coding specialization without changing their stored data', () => {
  assert.deepEqual(validateCards([card]), [card]);
  assert.equal(getAgentIdentity(card).role, 'Software engineer');
  assert.equal(getAgentIdentity(card).specialization, 'coding');
  assert.equal(getAgentIdentity(card).name, 'Kilo Gateway');
  assert.ok(!Object.hasOwn(validateCards([card])[0], 'agentName'));
});

test('named agent specialization and instructions survive browser persistence and workspace import/export', () => {
  const named = { ...card, ...normalizeAgentIdentity({ name: '  Mary  ', specialization: 'design', instructions: '  Keep controls accessible.  ' }) };
  const stored = new Map<string, string>();
  const persistence = createDeferredPersistence({ setItem: (key, value) => { stored.set(key, value); } }, { set: () => 1, clear: () => {} }, failed => assert.equal(failed, false));
  persistence.schedule('ahpah_cards_v3', [named]); persistence.flush();
  const restored = validateCards(JSON.parse(stored.get('ahpah_cards_v3')!));
  assert.deepEqual(restored, [named]);
  const exported = JSON.parse(JSON.stringify({ cards: restored, connections: [], memory: [] }));
  const imported = validateWorkspace(exported);
  assert.deepEqual(imported.cards, [named]);
  assert.equal(imported.cards[0].agentName, 'Mary');
  assert.equal(imported.cards[0].agentInstructions, 'Keep controls accessible.');
  assert.equal(getAgentIdentity(imported.cards[0]).role, 'Interface designer');
});

test('custom specialist role persists and invalid identities cannot enter a workspace', () => {
  const named = { ...card, ...normalizeAgentIdentity({ name: 'Josh', specialization: 'custom', role: 'API reliability engineer', instructions: 'Keep retries bounded.' }) };
  assert.equal(getAgentIdentity(validateCards([named])[0]).role, 'API reliability engineer');
  for (const fields of [{ agentName: '' }, { agentName: 'x'.repeat(61) }, { agentName: 'line\nbreak' }, { specialization: 'imaginary' }, { agentInstructions: 42 }, { agentInstructions: 'x'.repeat(4001) }, { specialization: 'custom', role: '' }, { specialization: 'custom', role: 'x'.repeat(81) }])
    assert.throws(() => validateCards([{ ...card, ...fields }]), /invalid/);
  assert.throws(() => normalizeAgentIdentity({ name: 'Josh', specialization: 'custom' }), /Enter a role/);
});

test('provider display refreshes cannot replace user names and identity edits invalidate card rendering', () => {
  const named = { ...card, agentName: 'Josh', specialization: 'backend' as const };
  assert.equal(cardName({ ...named, title: 'A refreshed provider title' }), 'Josh');
  assert.equal(cardName({ ...named, agentType: 'custom', title: 'New custom API name' }), 'Josh');
  assert.equal(hasSameCardContent(named, { ...named, agentName: 'Mary' }), false);
  assert.equal(hasSameCardContent(named, { ...named, specialization: 'design' }), false);
  assert.equal(hasSameCardContent(named, { ...named, agentInstructions: 'New task focus' }), false);
  assert.equal(nextAgentName([{ ...card, agentName: 'Agent 1' }, { ...card, id: 'other', agentName: 'Agent 3' }]), 'Agent 2');
});

test('specialization reaches actual Canvas model requests across tool iterations and retains workspace rules', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const named = { ...card, ...normalizeAgentIdentity({ name: 'Josh', specialization: 'backend', instructions: 'Prefer clear API errors.' }) };
  const requests: Parameters<AgentSender>[0][] = [];
  const result = await runCanvasAgent({ cardId: card.id, project: createStarterProject(), goal: 'Inspect the project and describe the API approach.', providerId: 'fixture', signal: new AbortController().signal, agentIdentity: named, send: async request => {
    requests.push(request);
    return { model: 'fixture-model', tokens: 1, text: JSON.stringify({ actions: requests.length === 1 ? [{ tool: 'plan', steps: ['Inspect files', 'Describe the approach'] }, { tool: 'list_files' }] : [{ tool: 'finish', summary: 'Inspected sources and described the API approach.', review: 'Source inspection only. No files changed or tests run.' }] }) };
  } });
  assert.equal(result.completed, true);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const instructions = request.messages.find(message => message.role === 'system')!.content;
    assert.ok(instructions.startsWith(CANVAS_AGENT_INSTRUCTIONS));
    assert.match(instructions, /"name":"Josh"/);
    assert.match(instructions, /"role":"Backend engineer"/);
    assert.match(instructions, /Prefer clear API errors/);
    assert.match(instructions, /validation, cancellation, error handling/);
    assert.match(instructions, /do not change tool contracts/);
  }
  assert.match(agentIdentityInstructions({ ...named, specialization: 'custom', role: 'Game developer' }), /Game developer/);
});
