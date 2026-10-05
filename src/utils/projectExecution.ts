export interface ExecutionFile { path: string; content: string }

export interface ProjectExecutionCapabilities {
  available: boolean;
  commands: string[];
  reason?: string;
  timeoutMs?: number;
  executionNotice?: string;
  limits?: { fileBytes: number; projectBytes: number; files: number; outputBytes: number };
}

export interface ProjectExecutionRequest {
  projectId?: string;
  files: ExecutionFile[];
  command: string;
}

export interface ProjectExecutionResult {
  projectId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
  filesTruncated: boolean;
  files: ExecutionFile[];
  previewUrl?: string;
}

function localProjectServer(): boolean {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

export async function discoverProjectExecution(signal?: AbortSignal): Promise<ProjectExecutionCapabilities> {
  const unavailable = { available: false, commands: [], reason: "Run this repository locally with npm run dev to approve Node/npm commands. The hosted editor still supports file generation, review, preview, and download." };
  if (!localProjectServer()) return unavailable;
  try {
    const response = await fetch("/api/project/capabilities", { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000), cache: "no-store", redirect: "error" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return unavailable;
    const body = await response.json() as ProjectExecutionCapabilities;
    if (body.available !== true || !Array.isArray(body.commands)) return unavailable;
    return body;
  } catch (error) {
    if (signal?.aborted) throw error;
    return unavailable;
  }
}

/** Call only after the user approves the exact displayed command and project files. */
export async function runProjectCommand(request: ProjectExecutionRequest, signal?: AbortSignal): Promise<ProjectExecutionResult> {
  if (!localProjectServer()) throw new Error("Node/npm commands require the local app. Start it with npm run dev.");
  const response = await fetch("/api/project/run", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(135_000)]) : AbortSignal.timeout(135_000), redirect: "error",
  });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The local project runner is unavailable. Restart the app with npm run dev.");
  const body = await response.json() as ProjectExecutionResult & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "The local project command could not run.");
  if (!Array.isArray(body.files) || typeof body.projectId !== "string") throw new Error("The project runner returned an invalid result.");
  return body;
}
