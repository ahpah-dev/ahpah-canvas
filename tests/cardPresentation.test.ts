import { test } from "node:test";
import assert from "node:assert/strict";
import { cardName, isBusy, statusName } from "../src/utils/cardPresentation.ts";
import type { CanvasCard } from "../src/types/canvas.ts";

const card: CanvasCard = {
  id: "presentation", type: "agent", title: "Custom workspace card",
  x: 0, y: 0, width: 500, height: 500, history: [], currentPrompt: "",
  tokensUsed: 0, cpuPercent: 0, lastAction: "", status: "idle",
};

test("Kilo card names describe the provider for both automatic and manual models", () => {
  assert.equal(cardName({ ...card, agentType: "kilo", routedModel: "openai/gpt-6-luna" }), "Kilo Gateway");
  assert.equal(cardName({ ...card, agentType: "kilo", routedModel: "kilo-auto/free" }), "Kilo Gateway");
});

test("legacy gateway aliases use OmniRoute and custom cards keep their title", () => {
  for (const agentType of ["omniroute", "deepseek", "qwen"] as const)
    assert.equal(cardName({ ...card, agentType }), "OmniRoute Agent");
  assert.equal(cardName({ ...card, agentType: "custom" }), card.title);
});

test("statuses distinguish active requests, errors, plans and ready cards", () => {
  for (const status of ["thinking", "working"] as const) {
    assert.equal(isBusy({ ...card, status }), true);
    assert.equal(statusName({ ...card, status }), "Responding");
  }
  assert.equal(statusName({ ...card, status: "error" }), "Needs attention");
  assert.equal(statusName({ ...card, status: "approval_required" }), "Review plan");
  assert.equal(statusName(card), "Ready");
});
