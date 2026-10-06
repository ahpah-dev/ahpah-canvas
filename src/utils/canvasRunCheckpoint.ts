import type { EngineeringProject } from '../types/engineering.ts';
import type { AgentIdentityInput } from './agentIdentity.ts';
import { AGENT_SPECIALIZATIONS, normalizeAgentIdentity } from './agentIdentity.ts';
import { validateEngineeringProject } from './projectFiles.ts';
import type { AgentType } from '../types/canvas.ts';
import { AGENT_MAX_REQUESTS } from './agentRuntime.ts';
import { LOCAL_CODING_MAX_REQUESTS } from './localCoding.ts';

const DATABASE = 'ahpah-canvas-runs';
const STORE = 'active-runs';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CanvasRunCheckpoint {
  cardId: string;
  runId: string;
  goal: string;
  inputId: string;
  inputTimestamp: string;
  providerId: string;
  context: string;
  requestsUsed?: number;
  agentIdentity: AgentIdentityInput;
  baseProject: EngineeringProject;
  workingProject: EngineeringProject;
  startedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'cardId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the Canvas run checkpoint database.'));
    request.onblocked = () => reject(new Error('The Canvas run checkpoint database is busy in another tab.'));
  });
}

function safeCheckpoint(value: unknown): CanvasRunCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<CanvasRunCheckpoint>;
  if (typeof candidate.cardId !== 'string' || !candidate.cardId || candidate.cardId.length > 160 ||
    typeof candidate.runId !== 'string' || !/^[\w-]{1,100}$/.test(candidate.runId) ||
    typeof candidate.goal !== 'string' || !candidate.goal.trim() || candidate.goal.length > 6000 ||
    typeof candidate.inputId !== 'string' || candidate.inputId.length > 160 ||
    typeof candidate.inputTimestamp !== 'string' || candidate.inputTimestamp.length > 64 ||
    typeof candidate.providerId !== 'string' || !/^(?:kilo|omniroute|codex|custom:[\w-]{1,100})$/.test(candidate.providerId) ||
    typeof candidate.context !== 'string' || candidate.context.length > 64_000 ||
    (candidate.requestsUsed !== undefined && (typeof candidate.requestsUsed !== 'number' || !Number.isInteger(candidate.requestsUsed) || candidate.requestsUsed < 0 || candidate.requestsUsed > (candidate.providerId.startsWith('custom:') ? LOCAL_CODING_MAX_REQUESTS : AGENT_MAX_REQUESTS))) ||
    typeof candidate.startedAt !== 'number' || !Number.isFinite(candidate.startedAt) || Date.now() - candidate.startedAt > MAX_AGE_MS ||
    !candidate.agentIdentity || typeof candidate.agentIdentity !== 'object') return null;
  try {
    const identity = candidate.agentIdentity as AgentIdentityInput;
    const specialization = AGENT_SPECIALIZATIONS.some(item => item.id === identity.specialization) ? identity.specialization! : 'coding';
    const title = typeof identity.title === 'string' && identity.title.length <= 120 ? identity.title : 'Coding agent';
    const agentTypes: AgentType[] = ['omniroute', 'kilo', 'deepseek', 'qwen', 'custom', 'codex'];
    const agentType = agentTypes.includes(identity.agentType || 'omniroute') ? identity.agentType : 'omniroute';
    const agentIdentity: AgentIdentityInput = {
      ...normalizeAgentIdentity({
        name: typeof identity.agentName === 'string' ? identity.agentName : title,
        specialization,
        role: typeof identity.role === 'string' ? identity.role : '',
        instructions: typeof identity.agentInstructions === 'string' ? identity.agentInstructions : '',
      }),
      title,
      agentType,
    };
    const baseProject = validateEngineeringProject(candidate.baseProject);
    const workingProject = validateEngineeringProject(candidate.workingProject);
    if (baseProject.id !== workingProject.id) return null;
    return { ...candidate as CanvasRunCheckpoint, requestsUsed: candidate.requestsUsed ?? 0, agentIdentity, baseProject, workingProject };
  } catch { return null; }
}

export async function saveCanvasRunCheckpoint(checkpoint: CanvasRunCheckpoint): Promise<void> {
  const normalized = safeCheckpoint(checkpoint);
  if (!normalized) throw new Error('The Canvas run checkpoint is invalid or too large to resume safely.');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the Canvas run checkpoint.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving the Canvas run checkpoint was cancelled.'));
    });
    transaction.objectStore(STORE).put(normalized);
    await completed;
  } finally { database.close(); }
}

export async function listCanvasRunCheckpoints(): Promise<CanvasRunCheckpoint[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not read Canvas run checkpoints.'));
      transaction.onabort = () => reject(transaction.error || new Error('Reading Canvas run checkpoints was cancelled.'));
    });
    const values = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error || new Error('Could not read Canvas run checkpoints.'));
    });
    const active: CanvasRunCheckpoint[] = [];
    for (const value of values) {
      const checkpoint = safeCheckpoint(value);
      if (checkpoint) active.push(checkpoint);
      else {
        const cardId = value && typeof value === 'object' ? (value as { cardId?: unknown }).cardId : undefined;
        if (typeof cardId === 'string') store.delete(cardId);
      }
    }
    await completed;
    return active;
  } finally { database.close(); }
}

export async function clearCanvasRunCheckpoint(cardId: string, runId?: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || !cardId) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get(cardId);
    request.onsuccess = () => {
      if (!runId || (request.result as CanvasRunCheckpoint | undefined)?.runId === runId) store.delete(cardId);
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not clear the Canvas run checkpoint.'));
      transaction.onabort = () => reject(transaction.error || new Error('Clearing the Canvas run checkpoint was cancelled.'));
    });
  } finally { database.close(); }
}
