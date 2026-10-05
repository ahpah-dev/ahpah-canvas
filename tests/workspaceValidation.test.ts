import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCards, validateWorkspace } from "../src/utils/workspaceValidation.ts";

const card = {
  id: "agent", type: "agent", title: "Project agent", agentType: "custom",
  providerId: "provider", providerName: "My Provider", status: "idle",
  x: 20, y: 30, width: 500, height: 500, tokensUsed: 0, cpuPercent: 0,
  currentPrompt: "", lastAction: "Ready", history: [],
};
const line = { id: "line", text: "Hello", type: "output", timestamp: "" };
const connection = { id: "relationship", fromCardId: "agent", toCardId: "reviewer", label: "Review", active: true };
const memory = { id: "context", key: "project.goal", value: "Build a useful feature", author: "You", timestamp: "", type: "fact" };
const workspace = () => ({ cards: [card, { ...card, id: "reviewer" }], connections: [connection], memory: [memory] });

test("valid custom provider bindings and all supported optional card fields survive import", () => {
  const complete = {
    ...card, role: "Reviewer", parentId: "parent", pinned: true, minimized: false,
    browserUrl: "https://example.com", browserDevice: "mobile", noteContent: "# Project",
    cliCommand: "npm run dev", routedModel: "provider/current", modelSource: "live",
    legacyMigrated: true, compressionSavedPercent: 0, history: [line],
  };
  assert.deepEqual(validateCards([complete]), [complete]);
  assert.deepEqual(validateWorkspace(workspace()), workspace());
});

test("unknown imported credential and configuration fields cannot round-trip into exports", () => {
  const source = {
    ...workspace(), apiKey: "private-top-level",
    cards: [{ ...card, apiKey: "private-card", customProviders: [{ apiKey: "private-provider" }], history: [{ ...line, authorization: "private-line" }] }, { ...card, id: "reviewer" }],
    connections: [{ ...connection, token: "private-connection" }],
    memory: [{ ...memory, credentials: { apiKey: "private-memory" } }],
  };
  const result = validateWorkspace(source);
  assert.doesNotMatch(JSON.stringify(result), /private-|apiKey|authorization|credentials|customProviders/);
  assert.equal(result.cards[0].providerId, card.providerId);
  assert.equal(result.cards[0].providerName, card.providerName);
  assert.equal(result.cards[0].history[0].text, line.text);
  assert.equal(source.cards[0].apiKey, "private-card");
  assert.notEqual(result.cards[0], source.cards[0]);
  assert.notEqual(result.cards[0].history[0], source.cards[0].history[0]);
});

test("malformed optional card enums, strings, booleans and numeric metadata are rejected", () => {
  const invalid = [
    { agentType: "unconfigured-kind" }, { agentType: {} }, { status: "unknown" },
    { browserDevice: "tablet" }, { modelSource: "mock" }, { providerId: {} },
    { providerName: {} }, { parentId: 123 }, { cliCommand: {} },
    { pinned: "yes" }, { minimized: 1 }, { legacyMigrated: "true" },
    { compressionSavedPercent: "74" }, { compressionSavedPercent: Infinity },
    { compressionSavedPercent: -1 }, { compressionSavedPercent: 101 },
    { cpuPercent: -1 },
  ];
  for (const fields of invalid)
    assert.throws(() => validateCards([{ ...card, ...fields }]), /invalid/);
});

test("card and history IDs must be nonempty and history IDs unique within each card", () => {
  for (const id of ["", "   "])
    assert.throws(() => validateCards([{ ...card, id }]), /invalid/);
  assert.throws(() => validateCards([{ ...card, history: [{ ...line, id: "" }] }]), /invalid/);
  assert.throws(() => validateCards([{ ...card, history: [line, line] }]), /duplicate history/);
  assert.deepEqual(validateCards([{ ...card, history: [line] }, { ...card, id: "second", history: [line] }]).length, 2);
});

test("connection IDs are unique and labels and active flags have safe rendering types", () => {
  for (const fields of [
    { id: "" }, { label: {} }, { active: "true" }, { fromCardId: {} }, { toCardId: 0 },
  ])
    assert.throws(() => validateWorkspace({ ...workspace(), connections: [{ ...connection, ...fields }] }), /invalid connection/);
  assert.throws(() => validateWorkspace({ ...workspace(), connections: [connection, connection] }), /invalid connection/);
});

test("memory IDs must be unique and nonempty", () => {
  assert.throws(() => validateWorkspace({ ...workspace(), memory: [{ ...memory, id: "  " }] }), /invalid memory/);
  assert.throws(() => validateWorkspace({ ...workspace(), memory: [memory, memory] }), /invalid memory/);
});

test("array values and objects that stringify into enums are not valid records or enum values", () => {
  assert.throws(() => validateWorkspace([]), /Invalid workspace/);
  assert.throws(() => validateCards([{ ...card, type: { toString: () => "agent" } }]), /invalid/);
  assert.throws(() => validateCards([{ ...card, history: [{ ...line, type: { toString: () => "output" } }] }]), /invalid/);
  assert.throws(() => validateWorkspace({ ...workspace(), memory: [{ ...memory, type: { toString: () => "fact" } }] }), /invalid memory/);
});
