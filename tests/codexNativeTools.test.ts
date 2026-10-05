import { test } from "node:test";
import assert from "node:assert/strict";
import { CodexNativeSession, nativeToolAction, type NativeClient } from "../server/codexNativeTools.ts";

function fixture() {
  const calls: { method: string; params: any }[] = [];
  const replies: { id: number; result: any }[] = [];
  let closed = false;
  const client: NativeClient = {
    async call(method, params) { calls.push({ method, params }); return method === "thread/start" ? { thread: { id: "native-thread" } } : {}; },
    reply(id, result) { replies.push({ id, result }); },
    close() { closed = true; },
  };
  const session = new CodexNativeSession(client, "catalog-model");
  const tool = (id: number, name: string, args: unknown) => client.handleServerRequest?.({ id, method: "item/tool/call", params: { tool: `workspace_${name}`, arguments: args } });
  return { client, session, calls, replies, tool, closed: () => closed };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("native Codex calls receive real host results in the same session, including the current task", async t => {
  const { client, session, calls, replies, tool } = fixture(); t.after(() => session.close());
  const first = session.step("CURRENT GOAL", [{ role: "system", content: "Project instructions" }, { role: "user", content: "Prior context" }], "empty-cwd", new AbortController().signal);
  await flush();
  assert.ok(calls[0].params.dynamicTools.some((item: any) => item.name === "workspace_read_file"));
  assert.match(calls[1].params.input[0].text, /CURRENT GOAL/);
  tool(10, "read_file", { path: "index.html" });
  assert.deepEqual(JSON.parse((await first).text).actions, [{ path: "index.html", tool: "read_file" }]);
  assert.equal(replies.length, 0, "no fake result returned before the host runs the tool");
  const second = session.step("Real tool results: actual file contents", [], "empty-cwd", new AbortController().signal);
  await flush();
  assert.equal(replies[0].id, 10);
  assert.match(replies[0].result.contentItems[0].text, /actual file contents/);
  assert.equal(calls.filter(item => item.method === "thread/start").length, 1);
  client.onNotification?.({ method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { totalTokens: 50 } } } });
  tool(11, "finish", { summary: "Inspected the file", review: "No edits or tests" });
  assert.equal((await second).tokens, 50);
});

test("parallel tool requests are delivered only with their matching host batch", async t => {
  const { session, replies, tool } = fixture(); t.after(() => session.close());
  const first = session.step("Task", [], "empty", new AbortController().signal); await flush();
  tool(1, "read_file", { path: "a.js" }); tool(2, "read_file", { path: "b.js" });
  assert.equal(JSON.parse((await first).text).actions[0].path, "a.js");
  const second = session.step("contents of a.js", [], "empty", new AbortController().signal);
  assert.equal(JSON.parse((await second).text).actions[0].path, "b.js");
  assert.deepEqual(replies.map(item => item.id), [1]);
  const third = session.step("contents of b.js", [], "empty", new AbortController().signal);
  await flush(); tool(3, "finish", { summary: "Read both", review: "No tests" }); await third;
  assert.equal(replies[1].id, 2); assert.match(replies[1].result.contentItems[0].text, /b.js/);
});

test("native cancellation closes the process and rejects outstanding tool work", async () => {
  const { session, closed } = fixture(); const controller = new AbortController();
  const step = session.step("Task", [], "empty", controller.signal); await flush(); controller.abort(new Error("Stopped"));
  await assert.rejects(step, /closed|Stopped/); assert.equal(closed(), true);
});

test("native arguments cannot override the validated tool name", () => {
  assert.deepEqual(nativeToolAction("workspace_read_file", { tool: "run_command", path: "a.js" }), { tool: "read_file", path: "a.js" });
  assert.throws(() => nativeToolAction("shell", {}), /unsupported/);
  assert.throws(() => nativeToolAction("workspace_read_file", "not an object"), /Invalid/);
});
