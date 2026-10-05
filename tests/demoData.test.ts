import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_CARDS,
  LEGACY_DEMO_CARDS,
  LEGACY_DEMO_MEMORY,
  LEGACY_DEMO_CONNECTIONS,
  AGENT_REGISTRY,
} from "../src/data/mockAgents.ts";
import { validateWorkspace } from "../src/utils/workspaceValidation.ts";

test("historical samples remain valid workspaces and clearly identify demonstrations", () => {
  const sample = validateWorkspace({
    cards: LEGACY_DEMO_CARDS,
    memory: LEGACY_DEMO_MEMORY,
    connections: LEGACY_DEMO_CONNECTIONS,
  });
  for (const card of sample.cards) {
    assert.match(card.title, /^Demo · /);
    assert.equal(card.tokensUsed, 0);
    assert.equal(card.cpuPercent, 0);
    assert.equal(card.routedModel, undefined);
    assert.equal(card.modelSource, undefined);
    assert.notEqual(card.status, "working");
  }
  for (const item of sample.memory) assert.match(item.value, /^Demo · /);
});

test("starter cards contain no simulated model or token usage", () => {
  for (const card of INITIAL_CARDS) {
    assert.equal(card.status, "idle");
    assert.equal(card.tokensUsed, 0);
    assert.equal(card.routedModel, undefined);
    assert.equal(card.modelSource, undefined);
  }
});

test("legacy model cards use the live gateway and custom providers advertise API access", () => {
  assert.match(AGENT_REGISTRY.deepseek.name, /OmniRoute/);
  assert.match(AGENT_REGISTRY.qwen.name, /OmniRoute/);
  assert.match(AGENT_REGISTRY.custom.name, /API Provider/);
  assert.doesNotMatch(JSON.stringify({
    registry: AGENT_REGISTRY,
    cards: LEGACY_DEMO_CARDS,
    memory: LEGACY_DEMO_MEMORY,
  }), /qwen2[.]5|Qwen 2[.]5|deepseek-r1|DeepSeek-R1|zero downtime|74%/i);
});
