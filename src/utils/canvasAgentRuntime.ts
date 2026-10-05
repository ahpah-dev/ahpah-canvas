import type { AgentFileSyncResult, AgentRunEvent, AgentRunResult, AgentSender, EngineeringFile, EngineeringProject } from '../types/engineering.ts';
import { runEngineeringAgent, ENGINEERING_AGENT_INSTRUCTIONS } from './agentRuntime.ts';
import { applyProjectChanges, validateEngineeringProject, validateProjectFiles } from './projectFiles.ts';

const CANVAS_PROJECT_PREFIX = 'ahpah_canvas_project_v1:';
const latestRuns = new Map<string, symbol>();
const activeRuns = new Map<string, { id: symbol; controller: AbortController }>();
const liveProjects = new Map<string, EngineeringProject>();

/** The same validated tool runner as Code, with automatic delivery of reviewed Canvas files. */
export const CANVAS_AGENT_INSTRUCTIONS = `${ENGINEERING_AGENT_INSTRUCTIONS}

CANVAS WORKSPACE RULES (these replace Code's stage-for-human-review instructions):
This Canvas conversation owns a real persistent source project. The user expects coding work to reach their connected PC folder automatically. Write and patch tools prepare complete source files; they do not themselves prove a PC write.
Implement coding requests through the documented JSON tools. Do not return fenced code, prose-only "I've created" claims, fictional buttons, or invented tool calls. Planning, coding questions, and non-coding replies can use finish without changing files. Never modify files for a read-only question.
Use plan first, list/read existing sources, write complete files, then use read_file to review every changed file AFTER the latest write or patch. For large files read successive startLine/endLine ranges covering the whole file. Do not use placeholder comments in place of actual implementation. Prefer a compact self-contained HTML file for games and websites unless the user requests a multi-file project or existing sources already use one. Make HTML complete through </html>, and include a meaningful title. Keep responses small enough to avoid token truncation; create several manageable source files when appropriate.
The additional tool {"tool":"save_files"} validates and prepares reviewed new or updated source files for automatic delivery. It requires actual changed source, so never call it for an explanation-only reply. Its prepared result is NOT a PC write. finish performs the actual delivery after all tools succeed and the source review completes, unless the user requested no saving. The app reports the real destination or queued status. A disconnected folder means the files are ready and will save after the user connects a folder; this is NOT "saved to your PC". Permission or IO failures are real tool errors; fix or clearly report them. Never invent a successful save. Your finish summary should describe source implementation; the app supplies actual file delivery status separately.
Use export_html only for an explicit HTML export request. The application bundles the actual complete project and supplies the real saved/queued result. Use the requested game or project name for the export filename. If old history describes a game but contains no source, reconstruct the implementation from that history; never claim to have recovered unavailable original files.
Canvas cannot delete files on the PC. Do not call delete_file; users can review deletions in Code. Existing unrelated files are preserved. run_command only queues a request; tell the user to open Code and explicitly approve it. No command, test, package installation, or deployment has happened without actual output.
Preserve the original goal and repair tool errors from their real results. finish MUST be the last action and must include a concise implementation summary and honest review. Do not claim runtime testing when you only inspected source. If files cannot be completed, state the limitation explicitly. Partial files stay available for continuation in Canvas; incomplete runs are not automatically delivered to the PC.`;

function projectKey(cardId: string): string {
  if (!cardId || cardId.length > 160) throw new Error('Invalid Canvas card identity.');
  return `${CANVAS_PROJECT_PREFIX}${cardId}`;
}

export function loadCanvasProject(cardId: string): EngineeringProject | null {
  const live = liveProjects.get(cardId);
  if (live) return live;
  try {
    const saved = localStorage.getItem(projectKey(cardId));
    if (!saved) return null;
    const project = validateEngineeringProject(JSON.parse(saved));
    liveProjects.set(cardId, project);
    return project;
  } catch { return null; }
}

/** Seed complete legacy source only when this conversation has no persistent project yet. */
export function projectForCanvas(cardId: string, files: EngineeringFile[] = []): EngineeringProject {
  projectKey(cardId);
  return loadCanvasProject(cardId) ?? {
    schema: 1, id: crypto.randomUUID(), name: 'Canvas project', revision: 0,
    updatedAt: new Date().toISOString(), files: validateProjectFiles(files),
  };
}

export function saveCanvasProject(cardId: string, project: EngineeringProject): void {
  const valid = validateEngineeringProject(project);
  // A Code edit or explicit snapshot supersedes an older asynchronous agent result.
  latestRuns.set(cardId, Symbol('saved-source'));
  activeRuns.get(cardId)?.controller.abort(new DOMException('The Canvas source was changed by a newer edit.', 'AbortError'));
  activeRuns.delete(cardId);
  persistCanvasProject(cardId, valid);
}

function persistCanvasProject(cardId: string, valid: EngineeringProject): void {
  liveProjects.set(cardId, valid);
  localStorage.setItem(projectKey(cardId), JSON.stringify(valid));
}

export interface CanvasAgentResult extends AgentRunResult {
  project: EngineeringProject;
  folderSave?: AgentFileSyncResult;
  persistenceError?: string;
}

export async function runCanvasAgent(options: {
  cardId: string;
  project?: EngineeringProject;
  goal: string;
  providerId: string;
  send: AgentSender;
  signal: AbortSignal;
  context?: string;
  onEvent?: (event: AgentRunEvent) => void;
  syncFiles?: (files: EngineeringFile[], signal: AbortSignal) => Promise<AgentFileSyncResult>;
  exportHtml?: Parameters<typeof runEngineeringAgent>[0]['exportHtml'];
  maxTurns?: number;
  timeoutMs?: number;
}): Promise<CanvasAgentResult> {
  const original = validateEngineeringProject(options.project ?? projectForCanvas(options.cardId));
  const runId = Symbol(options.cardId);
  activeRuns.get(options.cardId)?.controller.abort(new DOMException('A newer Canvas run replaced this run.', 'AbortError'));
  const controller = new AbortController();
  activeRuns.set(options.cardId, { id: runId, controller });
  latestRuns.set(options.cardId, runId);
  const signal = AbortSignal.any([options.signal, controller.signal]);
  const assertCurrent = (operationSignal: AbortSignal) => {
    operationSignal.throwIfAborted();
    if (latestRuns.get(options.cardId) !== runId) throw new DOMException('Newer Canvas source replaced this run. Its files cannot be saved.', 'AbortError');
  };
  let folderSave: AgentFileSyncResult | undefined;
  let result: AgentRunResult;
  try {
    result = await runEngineeringAgent({
      ...options, signal, project: original, mode: 'canvas', instructions: CANVAS_AGENT_INSTRUCTIONS,
      context: undefined, conversationContext: options.context,
      syncFiles: options.syncFiles ? async (files, operationSignal) => {
        assertCurrent(operationSignal);
        const outcome = await options.syncFiles!(files, operationSignal);
        assertCurrent(operationSignal);
        return outcome;
      } : undefined,
      exportHtml: options.exportHtml ? async (artifact, operationSignal) => {
        assertCurrent(operationSignal);
        const outcome = await options.exportHtml!(artifact, operationSignal);
        assertCurrent(operationSignal);
        return outcome;
      } : undefined,
      onFolderSave: outcome => { folderSave = outcome; },
    });
  } finally {
    if (activeRuns.get(options.cardId)?.id === runId) activeRuns.delete(options.cardId);
  }
  // Preserve real generated files even when a provider stops, but only reviewed successful runs sync to PC.
  const project = result.changeSet.changes.length ? applyProjectChanges(original, result.changeSet.changes) : original;
  let persistenceError: string | undefined;
  try { if (latestRuns.get(options.cardId) === runId) persistCanvasProject(options.cardId, project); } catch {
    persistenceError = 'Browser storage could not retain this source project. Keep this tab open and save or open the generated files in Code before reloading.';
    options.onEvent?.({ activity: { id: crypto.randomUUID(), kind: 'error', title: 'Source persistence unavailable', detail: persistenceError, timestamp: new Date().toISOString() } });
  }
  return { ...result, project, ...(folderSave ? { folderSave } : {}), ...(persistenceError ? { persistenceError } : {}) };
}
