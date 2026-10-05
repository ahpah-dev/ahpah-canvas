export interface EngineeringFile { path: string; content: string }

export interface EngineeringProject {
  schema: 1;
  id: string;
  name: string;
  files: EngineeringFile[];
  revision: number;
  updatedAt: string;
}

export interface ProjectChange {
  path: string;
  before: string | null;
  after: string | null;
}

export interface EngineeringChangeSet {
  id: string;
  goal: string;
  createdAt: string;
  baseRevision: number;
  changes: ProjectChange[];
  plan: string[];
  summary: string;
  review: string;
  commands: string[];
  model: string;
  tokens: number;
}

export interface EngineeringProvider { id: string; label: string; model: string }
export interface AgentMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface AgentProgress { text: string; model?: string; phase?: string; detail?: string }
export type AgentSender = (request: {
  providerId: string;
  prompt: string;
  messages: AgentMessage[];
  signal: AbortSignal;
  onProgress?: (progress: AgentProgress) => void;
}) => Promise<{ text: string; model: string; tokens: number }>;

export type AgentPhase = 'planning' | 'implementing' | 'reviewing' | 'ready' | 'error' | 'stopped';
export interface AgentActivity {
  id: string;
  kind: 'plan' | 'tool' | 'model' | 'notice' | 'error';
  title: string;
  detail: string;
  timestamp: string;
}

export interface AgentRunEvent {
  phase?: AgentPhase;
  activity?: AgentActivity;
  plan?: string[];
  model?: string;
  tokens?: number;
  detail?: string;
  changes?: ProjectChange[];
}

export interface AgentRunResult {
  changeSet: EngineeringChangeSet;
  activities: AgentActivity[];
  completed: boolean;
  stopped: boolean;
  error?: string;
}
