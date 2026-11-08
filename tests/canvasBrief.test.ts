import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCanvasBrief } from "../src/utils/canvasBrief.ts";
import type { CanvasCard, Connection, TerminalLine } from "../src/types/canvas.ts";

const at = new Date("2026-01-02T03:04:05.000Z");
const base: CanvasCard = {
  id: "base", type: "agent", title: "Agent", x: 0, y: 0, width: 300, height: 200,
  history: [], currentPrompt: "", tokensUsed: 0, cpuPercent: 0, lastAction: "", status: "idle",
};
const line = (index: number, type: TerminalLine["type"], text: string): TerminalLine =>
  ({ id: `line-${index}`, type, text, timestamp: "00:00" });

test("an empty canvas says so instead of listing sections", () => {
  const brief = buildCanvasBrief([], [], { generatedAt: at });
  assert.match(brief, /^# Canvas brief/);
  assert.match(brief, /The canvas is empty\./);
  assert.doesNotMatch(brief, /## /);
});

test("agents are listed in reading order with their status, model, and work in progress", () => {
  const lower = { ...base, id: "lower", agentName: "Reviewer", x: 0, y: 400, status: "working" as const, role: "Reviews diffs", currentPrompt: "Check the auth change" };
  const upper = { ...base, id: "upper", agentName: "Builder", x: 500, y: 0, status: "idle" as const, routedModel: "gpt-x", lastAction: "Read src/App.tsx" };
  const brief = buildCanvasBrief([lower, upper], [], { generatedAt: at });
  assert.ok(brief.indexOf("### Builder") < brief.indexOf("### Reviewer"), "upper-row card comes first");
  assert.match(brief, /- \*\*Status:\*\* Responding/);
  assert.match(brief, /- \*\*Model:\*\* gpt-x/);
  assert.match(brief, /- \*\*Role:\*\* Reviews diffs/);
  assert.match(brief, /- \*\*Last action:\*\* Read src\/App\.tsx/);
  assert.match(brief, /- \*\*Working on:\*\*\n> Check the auth change/);
});

test("connections are described from each agent's point of view and listed once", () => {
  const a = { ...base, id: "a", agentName: "Alpha" };
  const b = { ...base, id: "b", agentName: "Beta" };
  const connections: Connection[] = [
    { id: "c1", fromCardId: "a", toCardId: "b", label: "hands off" },
    { id: "c2", fromCardId: "b", toCardId: "a" },
  ];
  const brief = buildCanvasBrief([a, b], connections, { generatedAt: at });
  assert.match(brief, /### Alpha[\s\S]*?- \*\*Connected to:\*\* Beta\n/);
  assert.match(brief, /### Beta[\s\S]*?- \*\*Connected to:\*\* Alpha\n/);
  assert.match(brief, /## Connections\n- Alpha → Beta \(hands off\)\n- Beta → Alpha/);
});

test("only the most recent activity lines are kept, in order", () => {
  const history = Array.from({ length: 12 }, (_, index) => line(index, "output", `step ${index + 1}`));
  const brief = buildCanvasBrief([{ ...base, agentName: "Long", history }], [], { generatedAt: at, recentLines: 3 });
  assert.doesNotMatch(brief, /step 9\b/);
  assert.match(brief, /  - Agent: step 10\n  - Agent: step 11\n  - Agent: step 12/);
});

test("activity labels show who said what and long lines are shortened", () => {
  const long = "x".repeat(400);
  const brief = buildCanvasBrief([{ ...base, agentName: "Talker", history: [line(1, "input", "Add a test"), line(2, "error", long)] }], [], { generatedAt: at });
  assert.match(brief, /  - You: Add a test/);
  assert.match(brief, /  - Error: x{219}…\n/);
});

test("multi-line prompts are quoted so their headings cannot break the structure", () => {
  const brief = buildCanvasBrief([{ ...base, agentName: "Quoter", currentPrompt: "## Not a heading\n- not a list" }], [], { generatedAt: at });
  assert.match(brief, /> ## Not a heading\n> - not a list/);
  assert.doesNotMatch(brief, /\n## Not a heading/);
});

test("notes, previews, and scratchpads are included with their details", () => {
  const cards: CanvasCard[] = [
    { ...base, id: "n", type: "note", title: "Decisions", noteContent: "Use SQLite.\n\n- ship it", x: 0, y: 0 },
    { ...base, id: "p", type: "browser", title: "Preview", browserUrl: "http://localhost:5173", x: 0, y: 100 },
    { ...base, id: "t", type: "terminal", title: "Scratch", cliCommand: "npm test", x: 0, y: 200 },
  ];
  const brief = buildCanvasBrief(cards, [], { generatedAt: at });
  assert.match(brief, /### Decisions\n\nUse SQLite\.\n\n- ship it/);
  assert.match(brief, /- Browser preview · Preview: http:\/\/localhost:5173/);
  assert.match(brief, /- Command scratchpad · Scratch: `npm test`/);
});

test("the header counts agents, notes, and connections", () => {
  const brief = buildCanvasBrief([{ ...base, agentName: "One" }, { ...base, id: "n", type: "note", title: "N" }], [], { generatedAt: at });
  assert.match(brief, /Generated 2026-01-02T03:04:05\.000Z · 1 agent · 1 note · 0 connections/);
});
