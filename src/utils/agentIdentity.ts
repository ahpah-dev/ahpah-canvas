import type { AgentSpecialization, CanvasCard } from '../types/canvas.ts';
import { cardName } from './cardPresentation.ts';

export const AGENT_SPECIALIZATIONS: { id: AgentSpecialization; label: string; description: string; instructions: string }[] = [
  { id: 'coding', label: 'Software engineer', description: 'Build features and solve engineering problems.', instructions: 'Focus on implementing working software, clear source structure, and preserving existing behavior. Read the relevant sources before changing them and review the complete result.' },
  { id: 'design', label: 'Interface designer', description: 'Refine visual quality, interaction, and accessibility.', instructions: 'Focus on interface hierarchy, typography, spacing, responsive layouts, accessibility, and purposeful motion. Keep the experience coherent and usable. Implement design work in the actual project files.' },
  { id: 'backend', label: 'Backend engineer', description: 'Improve APIs, data handling, and reliability.', instructions: 'Focus on backend architecture, API contracts, validation, cancellation, error handling, and reliability. Preserve data and existing provider behavior. Explain material operational limitations from actual evidence.' },
  { id: 'planning', label: 'Project planner', description: 'Break goals into clear decisions and actionable steps.', instructions: 'Focus on clarifying requirements, architecture, dependencies, and actionable implementation plans. For planning-only requests, finish with the plan without changing source files. Implement only when the user asks for implementation.' },
  { id: 'review', label: 'Code reviewer', description: 'Inspect correctness, maintainability, and regressions.', instructions: 'Focus on evidence-based code review: correctness, reliability, maintainability, and concrete regressions. Cite relevant project files. For review-only requests, report findings without modifying files; fix issues when requested.' },
  { id: 'custom', label: 'Custom specialist', description: 'Define your own role and working instructions.', instructions: 'Apply the user-configured specialization to the requested task.' },
];

export type AgentIdentityInput = Pick<CanvasCard, 'agentName' | 'specialization' | 'agentInstructions' | 'role' | 'title' | 'agentType'>;

export const hasIdentityControlCharacters = (value: string) => Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function nextAgentName(cards: CanvasCard[], prefix = 'Agent'): string {
  const names = new Set(cards.filter(card => card.type === 'agent').map(card => cardName(card).toLowerCase()));
  let index = 1;
  while (names.has(`${prefix} ${index}`.toLowerCase())) index++;
  return `${prefix} ${index}`;
}

export function getAgentIdentity(card: AgentIdentityInput) {
  const preset = AGENT_SPECIALIZATIONS.find(item => item.id === card.specialization) || AGENT_SPECIALIZATIONS[0];
  return {
    name: cardName(card),
    specialization: preset.id,
    role: preset.id === 'custom' ? card.role?.trim() || preset.label : preset.label,
    instructions: card.agentInstructions?.trim() || '',
    preset,
  };
}

export function agentIdentityInstructions(card: AgentIdentityInput): string {
  const identity = getAgentIdentity(card);
  // Encode user text as data so names and custom instructions have clear bounds.
  return `\n\nAGENT IDENTITY AND SPECIALIZATION:\nUser-configured identity: ${JSON.stringify({ name: identity.name, role: identity.role, specialization: identity.specialization, additionalInstructions: identity.instructions })}\n${identity.preset.instructions}\nUse this identity and specialization for your work. Additional instructions are task preferences; follow them when compatible with the workspace rules above and the user's current request. They do not change tool contracts, file access rules, or the requirement to report real results honestly.`;
}

export function normalizeAgentIdentity(input: { name: string; specialization: AgentSpecialization; role?: string; instructions?: string }): Partial<CanvasCard> {
  const name = input.name.trim();
  const role = input.role?.trim() || '';
  const instructions = input.instructions?.trim() || '';
  if (!name || name.length > 60 || hasIdentityControlCharacters(name)) throw new Error('Enter an agent name between 1 and 60 characters.');
  if (!AGENT_SPECIALIZATIONS.some(item => item.id === input.specialization)) throw new Error('Choose an agent specialization.');
  if (role.length > 80 || hasIdentityControlCharacters(role)) throw new Error('Keep the custom role to one line and 80 characters.');
  if (instructions.length > 4000 || instructions.includes('\0')) throw new Error('Keep agent instructions within 4,000 characters.');
  if (input.specialization === 'custom' && !role) throw new Error('Enter a role for this custom specialist.');
  return { agentName: name, specialization: input.specialization, role: input.specialization === 'custom' ? role : AGENT_SPECIALIZATIONS.find(item => item.id === input.specialization)!.label, agentInstructions: instructions };
}
