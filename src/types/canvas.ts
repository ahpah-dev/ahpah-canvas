export type CardType = 'agent' | 'terminal' | 'browser' | 'note';

export type AgentStatus = 'idle' | 'working' | 'thinking' | 'approval_required' | 'tests_passing' | 'error';

export type AgentType =
  | 'omniroute'
  | 'kilo'
  | 'deepseek'
  | 'qwen'
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'aider'
  | 'cursor'
  | 'grok'
  | 'ollama'
  | 'custom';

export interface TerminalLine {
  id: string;
  text: string;
  type: 'input' | 'output' | 'system' | 'error' | 'success' | 'plan' | 'diff' | 'route' | 'tool';
  timestamp: string;
}

export interface CanvasCard {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  agentType?: AgentType;
  providerId?: string;
  providerName?: string;
  status?: AgentStatus;
  role?: string;
  history: TerminalLine[];
  currentPrompt: string;
  tokensUsed: number;
  cpuPercent: number;
  lastAction: string;
  parentId?: string;
  pinned?: boolean;
  minimized?: boolean;
  browserUrl?: string;
  browserDevice?: 'desktop' | 'mobile';
  noteContent?: string;
  cliCommand?: string;
  routedModel?: string;
  modelSource?: 'live';
  legacyMigrated?: boolean;
  compressionSavedPercent?: number;
  pendingCommands?: string[];
}

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  author: string;
  timestamp: string;
  type: 'fact' | 'decision' | 'changelog';
}

export interface Connection {
  id: string;
  fromCardId: string;
  toCardId: string;
  label?: string;
  active?: boolean;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  description: string;
  tags: string[];
  cards: CanvasCard[];
  connections: Connection[];
  memory: MemoryItem[];
}

export interface VoiceDispatchEvent {
  transcript: string;
  targetAgent?: string;
  action: 'spawn' | 'prompt' | 'run_all' | 'clear' | 'setup' | 'unknown';
  parameters?: string;
}

export interface GatewayConfig {
  omniRouteUrl: string;
  omniRouteStrategy: string;
  kiloModel: string;
  isAutoFreeEnabled: boolean;
  isRtkCompressionEnabled: boolean;
}
