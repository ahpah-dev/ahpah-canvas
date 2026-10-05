import type { AgentType, CanvasCard, Connection, MemoryItem, WorkspacePreset } from '../types/canvas';

export interface AgentDefinition {
  type: AgentType;
  name: string;
  command: string;
  badge: string;
  color: string;
  borderColor: string;
  bgGlow: string;
  description: string;
  defaultRole: string;
  quickPrompts: string[];
}

export const AGENT_REGISTRY: Record<AgentType, AgentDefinition> = {
  omniroute: {
    type: 'omniroute',
    name: 'OmniRoute Gateway',
    command: 'OmniRoute API gateway',
    badge: 'OmniRoute gateway',
    color: '#06b6d4',
    borderColor: 'border-cyan-500/50',
    bgGlow: 'shadow-[0_0_25px_rgba(6,182,212,0.2)]',
    description: 'OpenAI-compatible model gateway. Choose an available model from your live catalog.',
    defaultRole: 'Engineering planning & review',
    quickPrompts: [
      'Review the code I provide for bugs and suggest a minimal fix',
      'Plan this feature with affected files and verification steps',
      'Explain the tradeoffs in this implementation',
    ],
  },
  kilo: {
    type: 'kilo',
    name: 'Kilo AI Gateway',
    command: 'Kilo AI Gateway API',
    badge: 'Live model catalog',
    color: '#10b981',
    borderColor: 'border-emerald-500/50',
    bgGlow: 'shadow-[0_0_25px_rgba(16,185,129,0.2)]',
    description: 'Kilo AI Gateway with dynamic Auto Free model routing.',
    defaultRole: 'Implementation & code review',
    quickPrompts: [
      'Refactor the auth middleware and explain the changes',
      'Generate tests for the selected module',
      'Review the current changes for edge cases',
    ],
  },
  deepseek: {
    type: 'deepseek',
    name: 'OmniRoute · Planning',
    command: 'OmniRoute API gateway',
    badge: 'Live model catalog',
    color: '#a855f7',
    borderColor: 'border-purple-500/50',
    bgGlow: 'shadow-[0_0_25px_rgba(168,85,247,0.2)]',
    description: 'A planning card using your selected OmniRoute model.',
    defaultRole: 'Algorithmic Architect & Verifier',
    quickPrompts: [
      'Design high-throughput concurrent queue without race conditions',
      'Optimize recursive graph traversal for dependency tree',
      'Formulate formal verification proof for cryptographic JWT',
    ],
  },
  qwen: {
    type: 'qwen',
    name: 'OmniRoute · Coding',
    command: 'OmniRoute API gateway',
    badge: 'Live model catalog',
    color: '#38bdf8',
    borderColor: 'border-sky-500/50',
    bgGlow: 'shadow-[0_0_25px_rgba(56,189,248,0.2)]',
    description: 'A coding card using your selected OmniRoute model.',
    defaultRole: 'Speed & Code Synthesis Lead',
    quickPrompts: [
      'Generate full CRUD endpoints with Zod schema validation',
      'Write end-to-end Playwright tests for checkout flow',
      'Convert legacy JavaScript codebase to strict TypeScript',
    ],
  },
  claude: {
    type: 'claude',
    name: 'Claude Code',
    command: 'claude',
    badge: 'Demo card',
    color: '#d97706',
    borderColor: 'border-amber-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(217,119,6,0.15)]',
    description: 'A sample Claude Code card for demo mode. Connect an API provider to send live prompts.',
    defaultRole: 'Lead Orchestrator',
    quickPrompts: [
      'Refactor auth middleware to use JWT refresh tokens',
      'Optimize database queries in /api/dashboard',
      'Fix TypeScript strict null checks across src/components',
    ],
  },
  codex: {
    type: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    badge: 'Demo card',
    color: '#10b981',
    borderColor: 'border-emerald-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
    description: 'A sample Codex card for demo mode. Connect an API provider to send live prompts.',
    defaultRole: 'Test & Verification Specialist',
    quickPrompts: [
      'Generate end-to-end Vitest suite for checkout flow',
      'Analyze edge cases for concurrency race condition',
      'Draft step-by-step schema migration for Postgres',
    ],
  },
  gemini: {
    type: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    badge: 'Demo card',
    color: '#38bdf8',
    borderColor: 'border-sky-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(56,189,248,0.15)]',
    description: 'A sample Gemini card for demo mode. Connect an API provider to send live prompts.',
    defaultRole: 'Monorepo Auditor & Docs',
    quickPrompts: [
      'Index monorepo symbols and generate OpenAPI spec',
      'Audit entire codebase for security vulnerabilities',
      'Generate interactive architectural diagram in Mermaid',
    ],
  },
  aider: {
    type: 'aider',
    name: 'Aider',
    command: 'aider',
    badge: 'Demo card',
    color: '#ec4899',
    borderColor: 'border-pink-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(236,72,153,0.15)]',
    description: 'A sample Aider card for demo mode. Connect an API provider to send live prompts.',
    defaultRole: 'Frontend Feature Builder',
    quickPrompts: [
      'Add dark mode toggle and polish CSS variables',
      'Implement real-time WebSocket connection listener',
      'Create reusable animated toast notification component',
    ],
  },
  cursor: {
    type: 'cursor',
    name: 'Cursor Agent CLI',
    command: 'cursor-agent',
    badge: 'Demo card',
    color: '#8b5cf6',
    borderColor: 'border-purple-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(139,92,246,0.15)]',
    description: 'A sample Cursor card for demo mode. Connect an API provider to send live prompts.',
    defaultRole: 'Speed Refactorer',
    quickPrompts: [
      'Extract duplicate helper functions into /lib/utils',
      'Convert legacy callbacks to modern async/await',
      'Benchmark JSON parser performance',
    ],
  },
  grok: {
    type: 'grok',
    name: 'Grok Code CLI',
    command: 'grok',
    badge: 'Demo card',
    color: '#f97316',
    borderColor: 'border-orange-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(249,115,22,0.15)]',
    description: 'A sample Grok card for demo mode. Connect an API provider to send live prompts.',
    defaultRole: 'Algorithm Optimizer',
    quickPrompts: [
      'Implement zero-alloc LRU cache with TTL',
      'Reverse engineer third-party payload structure',
      'Optimize WebGL canvas render loop to 120 FPS',
    ],
  },
  ollama: {
    type: 'ollama',
    name: 'Ollama (Local LLM)',
    command: 'Ollama OpenAI-compatible API',
    badge: 'Custom API supported',
    color: '#06b6d4',
    borderColor: 'border-cyan-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)]',
    description: 'Connect a local Ollama endpoint as a custom API provider and choose a model from its catalog.',
    defaultRole: 'Offline Privacy Guard',
    quickPrompts: [
      'Scan code for hardcoded secrets or API tokens',
      'Generate localized test fixtures without network calls',
      'Format raw SQL schema into TypeORM models',
    ],
  },
  custom: {
    type: 'custom',
    name: 'Custom API Provider',
    command: 'OpenAI-compatible API',
    badge: 'Custom endpoint',
    color: '#a855f7',
    borderColor: 'border-purple-500/40',
    bgGlow: 'shadow-[0_0_20px_rgba(168,85,247,0.15)]',
    description: 'Connect your own OpenAI-compatible endpoint and choose an available model.',
    defaultRole: 'Project engineering assistant',
    quickPrompts: [
      'Plan this feature with file changes and verification steps',
      'Review the code I provide for correctness and edge cases',
      'Help isolate this bug and suggest a focused fix',
    ],
  },
};

// Historical sample IDs are retained for saved-workspace migration. Every sample
// is explicitly a demonstration and makes no claims about provider availability.
export const LEGACY_DEMO_MEMORY: MemoryItem[] = [
  { id: 'mem-omniroute', key: 'demo.goal', value: 'Demo · sample project: create a clear, focused workspace.', author: 'Demo · Planner', timestamp: '', type: 'decision' },
  { id: 'mem-kilo', key: 'demo.review', value: 'Demo · sample review: keep decisions beside the conversation.', author: 'Demo · Reviewer', timestamp: '', type: 'fact' },
];

export const LEGACY_DEMO_CARDS: CanvasCard[] = [
  {
    id: 'card-omniroute-lead', type: 'agent', agentType: 'omniroute',
    x: 60, y: 80, width: 500, height: 500,
    title: 'Demo · Planner', role: 'Sample project planning', status: 'idle',
    tokensUsed: 0, cpuPercent: 0, lastAction: 'Demo · sample conversation', currentPrompt: '',
    history: [
      { id: 'om-1', text: 'Demo · sample prompt: outline a focused project workspace.', type: 'input', timestamp: '' },
      { id: 'om-2', text: 'Keep the goal in a project note, use one card for exploration, and a second card to review the result.', type: 'output', timestamp: '' },
    ],
  },
  {
    id: 'card-kilo-worker', type: 'agent', agentType: 'kilo', parentId: 'card-omniroute-lead',
    x: 600, y: 80, width: 500, height: 500,
    title: 'Demo · Builder', role: 'Sample implementation discussion', status: 'idle',
    tokensUsed: 0, cpuPercent: 0, lastAction: 'Demo · sample conversation', currentPrompt: '',
    history: [
      { id: 'kc-1', text: 'Demo · sample prompt: suggest the first implementation step.', type: 'input', timestamp: '' },
      { id: 'kc-2', text: 'Start with the smallest useful feature. Capture the expected behavior before building it, then review the result in context.', type: 'output', timestamp: '' },
    ],
  },
  {
    id: 'card-deepseek-reasoning', type: 'agent', agentType: 'omniroute', parentId: 'card-omniroute-lead',
    x: 1140, y: 80, width: 480, height: 500,
    title: 'Demo · Reviewer', role: 'Sample review plan', status: 'idle',
    tokensUsed: 0, cpuPercent: 0, lastAction: 'Demo · sample review', currentPrompt: '',
    history: [
      { id: 'ds-1', text: 'Demo · sample prompt: review the proposed approach.', type: 'input', timestamp: '' },
      { id: 'ds-2', text: '1. Check the main user flow.\n2. Consider loading and empty states.\n3. Review keyboard access.\n4. Keep the project note up to date.', type: 'plan', timestamp: '' },
    ],
  },
  {
    id: 'card-browser-preview', type: 'browser', x: 60, y: 620, width: 580, height: 480,
    title: 'Demo · Preview', browserUrl: 'about:blank', browserDevice: 'desktop',
    tokensUsed: 0, cpuPercent: 0, lastAction: 'Add a URL to preview your project', currentPrompt: '', history: [],
  },
  {
    id: 'card-terminal-shell', type: 'terminal', x: 680, y: 620, width: 460, height: 480,
    title: 'Demo · Terminal', tokensUsed: 0, cpuPercent: 0, lastAction: 'Demo · sample terminal output', currentPrompt: '',
    history: [{ id: 't1', text: 'Demo · sample output. This card does not execute a local shell.', type: 'system', timestamp: '' }],
  },
  {
    id: 'card-notes', type: 'note', x: 1180, y: 620, width: 440, height: 480,
    title: 'Demo · Project Notes', tokensUsed: 0, cpuPercent: 0, lastAction: 'Demo · sample project note', currentPrompt: '',
    noteContent: '# Demo · sample project\n\nCapture the goal, constraints, and next step here.\n\n- [ ] Define the goal\n- [ ] Explore an approach\n- [ ] Review the result', history: [],
  },
];

export const LEGACY_DEMO_CONNECTIONS: Connection[] = [
  { id: 'conn-omniroute-to-kilo', fromCardId: 'card-omniroute-lead', toCardId: 'card-kilo-worker', label: 'Demo · build relationship', active: true },
  { id: 'conn-omniroute-to-deepseek', fromCardId: 'card-omniroute-lead', toCardId: 'card-deepseek-reasoning', label: 'Demo · review relationship', active: true },
];

export const INITIAL_MEMORY: MemoryItem[] = [];

export const INITIAL_CONNECTIONS: Connection[] = [];

export const INITIAL_CARDS: CanvasCard[] = [
  {
    id: 'starter-omniroute',
    type: 'agent',
    agentType: 'omniroute',
    x: 100,
    y: 100,
    width: 500,
    height: 500,
    title: 'OmniRoute Agent',
    role: 'OpenAI-compatible gateway',
    status: 'idle',
    tokensUsed: 0,
    cpuPercent: 0,
    lastAction: 'Choose a model in Settings to get started',
    currentPrompt: '',
    history: [{
      id: 'starter-omni-hint',
      text: 'Connect OmniRoute and load its current model catalog in Settings.',
      type: 'system',
      timestamp: '',
    }],
  },
  {
    id: 'starter-kilo',
    type: 'agent',
    agentType: 'kilo',
    x: 660,
    y: 100,
    width: 500,
    height: 500,
    title: 'Kilo Auto Free',
    role: 'Dynamic free model routing',
    status: 'idle',
    tokensUsed: 0,
    cpuPercent: 0,
    lastAction: 'Ready when you are',
    currentPrompt: '',
    history: [{
      id: 'starter-kilo-hint',
      text: 'Kilo selects the current model behind Auto Free for each session.',
      type: 'system',
      timestamp: '',
    }],
  },
];

export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {id:'preset-oneclick-free',name:'Gateway studio',description:'Two gateway cards, ready for your next idea.',tags:['OmniRoute','Kilo Auto Free'],cards:INITIAL_CARDS,connections:[],memory:[]},
  {id:'preset-focused',name:'Focused workspace',description:'One OmniRoute agent and a project note. A little room to think.',tags:['Agent','Notes'],cards:[INITIAL_CARDS[0],{id:'preset-project-note',type:'note',x:660,y:100,width:420,height:500,title:'Project Notes',history:[],currentPrompt:'',tokensUsed:0,cpuPercent:0,lastAction:'Project notes ready',noteContent:'# Your next idea\n\nWrite down the goal, the constraints, and the next step.\n\n- [ ] Define the goal\n- [ ] Explore an approach\n- [ ] Review the result'}],connections:[],memory:[]},
  {id:'preset-review',name:'Build & review',description:'OmniRoute and a Kilo worker, with a visual relationship between their cards.',tags:['Build','Review'],cards:[INITIAL_CARDS[0],{...INITIAL_CARDS[1],parentId:INITIAL_CARDS[0].id}],connections:[{id:'preset-review-link',fromCardId:INITIAL_CARDS[0].id,toCardId:INITIAL_CARDS[1].id,label:'Review relationship',active:true}],memory:[]},
];
