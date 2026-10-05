import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeferredPersistence, createFrameQueue, isNearScrollBottom } from "../src/utils/interactionScheduling.ts";
import { hasSameCardContent } from "../src/utils/cardRendering.ts";

function fakeScheduler() {
  let now = 0, nextId = 0;
  const callbacks = new Map<number, { at: number; callback: () => void }>();
  const set = (callback: () => void, delay: number) => {
    const id = ++nextId;
    callbacks.set(id, { at: now + delay, callback });
    return id;
  };
  const clear = (id: number) => { callbacks.delete(id); };
  return {
    set, clear,
    request: (callback: () => void) => set(callback, 16),
    cancel: clear,
    tick(duration: number) {
      const end = now + duration;
      while (true) {
        const next = [...callbacks.entries()].filter(([, task]) => task.at <= end)
          .sort(([, left], [, right]) => left.at - right.at)[0];
        if (!next) break;
        callbacks.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = end;
    },
    size: () => callbacks.size,
  };
}

test("a burst of 100 pointer inputs commits only the newest value once per frame", () => {
  const scheduler = fakeScheduler();
  const updates: number[] = [];
  const queue = createFrameQueue((value: number) => updates.push(value), scheduler);
  for (let move = 0; move < 100; move++) queue.push(move);
  assert.equal(scheduler.size(), 1);
  assert.deepEqual(updates, []);
  scheduler.tick(16);
  assert.deepEqual(updates, [99]);
  queue.push(100);
  scheduler.tick(16);
  assert.deepEqual(updates, [99, 100]);
});

test("pointer release flushes the final position immediately and cannot replay a stale frame", () => {
  const scheduler = fakeScheduler();
  const updates: number[] = [];
  const queue = createFrameQueue((value: number) => updates.push(value), scheduler);
  queue.push(9);
  queue.push(12);
  queue.flush();
  scheduler.tick(32);
  assert.deepEqual(updates, [12]);
  assert.equal(scheduler.size(), 0);
});

test("unmount cancellation discards pending gesture work", () => {
  const scheduler = fakeScheduler();
  const queue = createFrameQueue(() => assert.fail("late update"), scheduler);
  queue.push(1);
  queue.cancel();
  scheduler.tick(32);
  assert.equal(scheduler.size(), 0);
});

test("persistence defers serialization as well as writes until edits settle", () => {
  const scheduler = fakeScheduler();
  const writes: string[] = [];
  let serialized = 0;
  const store = createDeferredPersistence({ setItem: (_, value) => writes.push(value) }, scheduler, () => {});
  store.schedule("cards", { toJSON: () => { serialized++; return ["old"]; } });
  store.schedule("cards", { toJSON: () => { serialized++; return ["latest"]; } });
  assert.equal(serialized, 0);
  scheduler.tick(349);
  assert.equal(writes.length, 0);
  scheduler.tick(1);
  assert.equal(serialized, 1);
  assert.deepEqual(writes, ['["latest"]']);
});

test("continuous streamed updates have a bounded save delay", () => {
  const scheduler = fakeScheduler();
  const writes: string[] = [];
  const store = createDeferredPersistence({ setItem: (_, value) => writes.push(value) }, scheduler, () => {});
  for (let update = 0; update < 15; update++) {
    store.schedule("cards", { text: `chunk-${update}` });
    scheduler.tick(100);
  }
  assert.deepEqual(writes, ['{"text":"chunk-14"}']);
  store.schedule("cards", { text: "final" });
  scheduler.tick(350);
  assert.deepEqual(writes, ['{"text":"chunk-14"}', '{"text":"final"}']);
});

test("a 60-frame drag saves changed cards without rewriting memory, view, or connections", () => {
  const scheduler = fakeScheduler();
  const writes: string[] = [];
  const store = createDeferredPersistence({ setItem: (key) => writes.push(key) }, scheduler, () => {});
  const memory: never[] = [], connections: never[] = [];
  store.schedule("view", "canvas");
  store.schedule("cards", [{ x: 0 }]);
  store.schedule("memory", memory);
  store.schedule("connections", connections);
  store.flush();
  writes.length = 0;
  for (let frame = 0; frame < 60; frame++) {
    store.schedule("view", "canvas");
    store.schedule("cards", [{ x: frame }]);
    store.schedule("memory", memory);
    store.schedule("connections", connections);
    scheduler.tick(16);
  }
  scheduler.tick(350);
  assert.deepEqual(writes, ["cards"]);
});

test("pagehide/export flush saves the latest pending snapshot and clears every timer", () => {
  const scheduler = fakeScheduler();
  const writes: string[] = [];
  const store = createDeferredPersistence({ setItem: (_, value) => writes.push(value) }, scheduler, () => {});
  store.schedule("cards", { x: 1 });
  store.schedule("cards", { x: 50 });
  store.flush();
  scheduler.tick(2000);
  assert.deepEqual(writes, ['{"x":50}']);
  assert.equal(scheduler.size(), 0);
});

test("storage failure reports the issue and retains the newest snapshot for retry", () => {
  const scheduler = fakeScheduler();
  const results: boolean[] = [];
  const writes: string[] = [];
  let failing = true;
  const store = createDeferredPersistence({ setItem: (_, value) => {
    if (failing) throw new Error("quota exceeded");
    writes.push(value);
  } }, scheduler, (result) => results.push(result));
  store.schedule("cards", { x: 1 });
  store.flush();
  assert.deepEqual(results, [true]);
  store.schedule("cards", { x: 2 });
  failing = false;
  store.flush();
  assert.deepEqual(writes, ['{"x":2}']);
  assert.deepEqual(results, [true, false]);
});

test("one failed key does not block other keys and serializable data is retried", () => {
  const scheduler = fakeScheduler();
  const writes: string[] = [];
  const results: boolean[] = [];
  const store = createDeferredPersistence({ setItem: (key) => writes.push(key) }, scheduler, (result) => results.push(result));
  const circular: { self?: unknown } = {};
  circular.self = circular;
  store.schedule("cards", circular);
  store.schedule("view", "canvas");
  store.flush();
  assert.deepEqual(writes, ["view"]);
  assert.deepEqual(results, [true]);
  store.schedule("cards", []);
  store.flush();
  assert.deepEqual(writes, ["view", "cards"]);
  assert.deepEqual(results, [true, false]);
});

test("reverting a failed snapshot to the already saved value clears the warning", () => {
  const scheduler = fakeScheduler();
  const results: boolean[] = [];
  let failing = false;
  const saved = { x: 1 };
  const store = createDeferredPersistence({ setItem: () => { if (failing) throw new Error("quota"); } }, scheduler, (result) => results.push(result));
  store.schedule("cards", saved);
  store.flush();
  failing = true;
  store.schedule("cards", { x: 2 });
  store.flush();
  store.schedule("cards", saved);
  assert.deepEqual(results, [false, true, false]);
  assert.equal(scheduler.size(), 0);
});

test("scroll follow pauses while reading older content and resumes near the bottom", () => {
  assert.equal(isNearScrollBottom({ scrollTop: 100, clientHeight: 300, scrollHeight: 2000 }), false);
  assert.equal(isNearScrollBottom({ scrollTop: 1670, clientHeight: 300, scrollHeight: 2000 }), true);
});

test("card body equality ignores position and preserves all content, configuration, and size changes", () => {
  const card = { id: "card", x: 10, y: 20, width: 500, height: 500, title: "Agent", type: "agent" as const,
    history: [], currentPrompt: "", tokensUsed: 0, cpuPercent: 0, lastAction: "Ready" };
  assert.equal(hasSameCardContent(card, { ...card, x: 100, y: -100 }), true);
  assert.equal(hasSameCardContent({ ...card, role: undefined }, { ...card, parentId: undefined }), false);
  for (const update of [{ width: 680 }, { height: 620 }, { lastAction: "Thinking" }, { history: [] },
    { providerName: "New provider" }, { routedModel: "newest-model" }, { tokensUsed: 12 }]) {
    assert.equal(hasSameCardContent(card, { ...card, ...update }), false);
  }
});
