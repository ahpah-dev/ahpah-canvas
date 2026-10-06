import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile, link, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { createProjectMiddleware, normalizeProjectPath, parseProjectCommand } from "../server/projectBridge.ts";

async function fixture(t: { after: (callback: () => Promise<void>) => void }, timeoutMs = 5_000, binding = true) {
  const workspace = await mkdtemp(join(tmpdir(), "ahpah-project-test-"));
  const middleware = createProjectMiddleware({ workspaceRoot: workspace, timeoutMs, isLoopbackBinding: () => binding });
  const server: Server = createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end(); }); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>((finish) => server.close(() => finish()));
    assert.ok(resolve(workspace).startsWith(resolve(tmpdir())) && workspace.includes("ahpah-project-test-"));
    await rm(workspace, { recursive: true, force: true });
  });
  const run = (body: unknown, extra: RequestInit = {}) => fetch(`${origin}/api/project/run`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body), ...extra,
  });
  return { workspace, origin, run, server };
}

const main = (content: string) => [{ path: "main.mjs", content }];

test("project paths and commands reject traversal, shell syntax, credentials, and Windows aliases", () => {
  assert.equal(normalizeProjectPath("src\\main.ts"), "src/main.ts");
  for (const path of ["../outside.js", "/outside.js", "C:\\outside.js", "src/../out.js", "src//x.js", "NUL.js", "src/CON.txt", "src/a:stream", "trailing. /x", ".env", ".env.example", "x/.env.production", "key.pem", "node_modules/x.js", ".aws/config", ".pypirc", ".yarnrc", ".yarnrc.yml", ".netrc", ".git-credentials", "credentials", ".ahpah-manifest.json"])
    assert.throws(() => normalizeProjectPath(path), undefined, path);
  assert.equal(normalizeProjectPath(".environment.js"), ".environment.js");
  assert.deepEqual(parseProjectCommand('node "src/my script.mjs"'), { kind: "node", args: ["src/my script.mjs"] });
  assert.deepEqual(parseProjectCommand("node --check main.mjs"), { kind: "node", args: ["--check", "main.mjs"] });
  assert.deepEqual(parseProjectCommand("npm run test:unit"), { kind: "npm", args: ["run", "test:unit"] });
  for (const command of ["node -e 'process.exit()'", "node --eval=console.log(1).js", "node --check --eval=process.exit().js", "node main.mjs; echo hi", "npm install && echo hi", "npm run build -- --flag", "rm -rf /", "node ../x.js", "npm exec vite"])
    assert.throws(() => parseProjectCommand(command), undefined, command);
});

test("real Node execution returns bounded output, exit status and generated text files without inherited API keys", async (t) => {
  const { run } = await fixture(t);
  const previous = process.env.AHPAH_PRIVATE_API_KEY;
  process.env.AHPAH_PRIVATE_API_KEY = "private-fixture-value";
  t.after(() => { if (previous === undefined) delete process.env.AHPAH_PRIVATE_API_KEY; else process.env.AHPAH_PRIVATE_API_KEY = previous; });
  const response = await run({ command: "node main.mjs", files: main("import {writeFileSync,mkdirSync} from 'node:fs'; console.log('build ok',String(process.env.AHPAH_PRIVATE_API_KEY)); console.error('warning'); mkdirSync('src'); writeFileSync('src/generated.js','export const works = true;');") });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.projectId, /^[a-zA-Z0-9_-]+$/);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /build ok undefined/);
  assert.match(result.stderr, /warning/);
  assert.equal(result.timedOut, false);
  assert.ok(result.files.some((file: { path: string; content: string }) => file.path === "src/generated.js" && file.content.includes("works")));
  assert.ok(result.files.every((file: { path: string }) => !file.path.startsWith(".ahpah")));
  const failed = await (await run({ projectId: result.projectId, command: "node main.mjs", files: main("console.error('actual failure'); process.exit(7);") })).json();
  assert.equal(failed.exitCode, 7);
  assert.match(failed.stderr, /actual failure/);
  assert.ok(!failed.files.some((file: { path: string }) => file.path === "src/generated.js"), "removed browser files are removed from the mirrored project");
});

test("local capabilities and requests enforce origin, binding, method, body and file validation", async (t) => {
  const { origin, run } = await fixture(t);
  const capability = await (await fetch(`${origin}/api/project/capabilities`)).json();
  assert.equal(capability.available, true);
  assert.equal(capability.limits.files, 200);
  assert.equal(capability.limits.fileBytes, 256 * 1024);
  assert.match(capability.executionNotice, /not an OS security sandbox/);
  const valid = { command: "node main.mjs", files: main("console.log('ok')") };
  assert.equal((await run(valid, { headers: { Origin: "https://evil.example", "Content-Type": "application/json" } })).status, 403);
  assert.equal((await run(valid, { headers: { "Content-Type": "application/json" } })).status, 403);
  assert.equal((await run(valid, { headers: { Origin: "null", "Content-Type": "application/json" } })).status, 403);
  assert.equal((await run(valid, { headers: { Origin: origin, "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await run(valid, { body: "broken-json" })).status, 400);
  assert.equal((await fetch(`${origin}/api/project/run`)).status, 405);
  assert.equal((await fetch(`${origin}/api/project/unknown`)).status, 404);
  assert.equal((await run({ ...valid, projectId: "../escape" })).status, 400);
  assert.equal((await run({ ...valid, files: [{ path: "../escape.mjs", content: "" }] })).status, 400);
  assert.equal((await run({ ...valid, files: [...main(""), { path: "MAIN.MJS", content: "" }] })).status, 400);
  assert.equal((await run({ ...valid, files: main("x".repeat(256 * 1024 + 1)) })).status, 413);
  const publicServer = await fixture(t, 5_000, false);
  assert.equal((await publicServer.run(valid)).status, 403);
  assert.equal((await fetch(`${publicServer.origin}/api/project/capabilities`)).status, 403);
});

test("npm scripts launch through Node without shell interpolation and node syntax checking is supported", async (t) => {
  const { origin, run } = await fixture(t);
  const capabilities = await (await fetch(`${origin}/api/project/capabilities`)).json();
  if (capabilities.commands.includes("npm run <script>")) {
    const response = await run({ command: "npm run verify", files: [...main("console.log('npm script actual output');"), { path: "package.json", content: JSON.stringify({ scripts: { verify: "node main.mjs" } }) }] });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.exitCode, 0); assert.match(result.stdout, /npm script actual output/);
    assert.equal((await run({ command: "npm run missing", files: [{ path: "package.json", content: "{}" }] })).status, 400);
  }
  const syntax = await (await run({ command: "node --check main.mjs", files: main("export const valid = 1;") })).json();
  assert.equal(syntax.exitCode, 0);
});

test("timeouts terminate running commands and bound output", async (t) => {
  const { run } = await fixture(t, 500);
  const result = await (await run({ command: "node main.mjs", files: main("console.log('started'); setInterval(() => {}, 1000);") })).json();
  assert.equal(result.timedOut, true);
  assert.match(result.stdout, /started/);
  const overflow = await fixture(t);
  const log = await (await overflow.run({ command: "node main.mjs", files: main("process.stdout.write('x'.repeat(400000));") })).json();
  assert.equal(log.exitCode, 0);
  assert.equal(log.truncated, true);
  assert.ok(Buffer.byteLength(log.stdout) <= 256_000);
});

test("aborting the browser request kills its command and releases the project lock", async (t) => {
  const { workspace, run } = await fixture(t, 2_000);
  const controller = new AbortController();
  const pending = run({ projectId: "cancel-fixture", command: "node main.mjs", files: [
    ...main("import {writeFileSync} from 'node:fs'; import {spawn} from 'node:child_process'; spawn(process.execPath,['child.mjs'],{stdio:'ignore',windowsHide:true}); writeFileSync('started.txt','ready'); setInterval(()=>{},1000);"),
    { path: "child.mjs", content: "import {writeFileSync} from 'node:fs'; setTimeout(()=>writeFileSync('escaped.txt','still alive'),700);" },
  ] }, { signal: controller.signal });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await readFile(join(workspace, ".ahpah-projects/cancel-fixture/started.txt")); break; }
    catch { await new Promise((finish) => setTimeout(finish, 20)); }
  }
  controller.abort(); await assert.rejects(pending, { name: "AbortError" });
  await new Promise((finish) => setTimeout(finish, 850));
  await assert.rejects(readFile(join(workspace, ".ahpah-projects/cancel-fixture/escaped.txt")), { code: "ENOENT" });
  const next = await run({ projectId: "cancel-fixture", command: "node main.mjs", files: main("console.log('next')") });
  assert.equal(next.status, 200);
});

test("command output preserves UTF-8 characters split across stdout and stderr chunks", async (t) => {
  const { run } = await fixture(t);
  const result = await (await run({ command: "node main.mjs", files: main("const text=Buffer.from('Ready 🌙 café'); for (const byte of text) { process.stdout.write(Buffer.from([byte])); process.stderr.write(Buffer.from([byte])); await new Promise(resolve=>setTimeout(resolve,10)); }") })).json();
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "Ready 🌙 café");
  assert.equal(result.stderr, "Ready 🌙 café");
});

test("Stop during command preparation prevents process launch and releases the project lock", async (t) => {
  const { workspace, run, server } = await fixture(t);
  const controller = new AbortController();
  let prepared!: () => void, resume!: () => void, disconnected!: () => void;
  const preparing = new Promise<void>((finish) => { prepared = finish; });
  const paused = new Promise<void>((finish) => { resume = finish; });
  const closed = new Promise<void>((finish) => { disconnected = finish; });
  const originalMkdir = fsPromises.mkdir;
  const mock = t.mock.method(fsPromises, "mkdir", async (...args: Parameters<typeof fsPromises.mkdir>) => {
    if (String(args[0]) === join(workspace, ".ahpah-projects/preparation-fixture/.ahpah-temp")) {
      prepared(); await paused;
    }
    return originalMkdir(...args);
  });
  syncBuiltinESMExports();
  const restore = () => { resume(); mock.mock.restore(); syncBuiltinESMExports(); };
  t.after(restore);
  server.once("request", (_request, response) => { response.once("close", disconnected); });
  const pending = run({ projectId: "preparation-fixture", command: "node main.mjs", files: main("import {writeFileSync} from 'node:fs'; writeFileSync('should-not-run.txt','ran');") }, { signal: controller.signal });
  await preparing;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await closed;
  restore();
  let next!: Response;
  for (let attempt = 0; attempt < 50; attempt++) {
    next = await run({ projectId: "preparation-fixture", command: "node main.mjs", files: main("console.log('resumed')") });
    if (next.status !== 409) break;
    await next.arrayBuffer();
    await new Promise((finish) => setTimeout(finish, 10));
  }
  assert.equal(next.status, 200);
  const result = await next.json();
  assert.match(result.stdout, /resumed/);
  assert.ok(!result.files.some((file: { path: string }) => file.path === "should-not-run.txt"));
  await assert.rejects(readFile(join(workspace, ".ahpah-projects/preparation-fixture/should-not-run.txt")), { code: "ENOENT" });
});

test("bounded command output omits a character split by the byte limit", async (t) => {
  const { run } = await fixture(t);
  const result = await (await run({ command: "node main.mjs", files: main("process.stdout.write('x'.repeat(255998)+'🌙');") })).json();
  assert.equal(result.exitCode, 0);
  assert.equal(result.truncated, true);
  assert.equal(result.stdout, "x".repeat(255998));
  assert.ok(Buffer.byteLength(result.stdout) <= 256_000);
});

test("linked files and project folders cannot overwrite files outside the project", async (t) => {
  const { workspace, run } = await fixture(t);
  const outside = join(workspace, "outside.txt"); await writeFile(outside, "private outside content");
  const folder = join(workspace, ".ahpah-projects/linked-fixture"); await mkdir(folder, { recursive: true });
  await link(outside, join(folder, "main.mjs"));
  assert.equal((await run({ projectId: "linked-fixture", command: "node main.mjs", files: main("console.log('overwrite')") })).status, 400);
  assert.equal(await readFile(outside, "utf8"), "private outside content");
  const outsideFolder = join(workspace, "outside-folder"); await mkdir(outsideFolder);
  await symlink(outsideFolder, join(workspace, ".ahpah-projects/junction-fixture"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await run({ projectId: "junction-fixture", command: "node main.mjs", files: main("console.log('overwrite')") })).status, 400);
});

test("rejected concurrent commands cannot release another command's project lock", async (t) => {
  const { workspace, run } = await fixture(t);
  const projectId = "concurrency-fixture";
  const running = run({ projectId, command: "node main.mjs", files: main("import {writeFileSync} from 'node:fs'; writeFileSync('started.txt','ready'); setTimeout(()=>console.log('finished'),650);") });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await readFile(join(workspace, `.ahpah-projects/${projectId}/started.txt`)); break; }
    catch { await new Promise((finish) => setTimeout(finish, 20)); }
  }
  const request = { projectId, command: "node main.mjs", files: main("console.log('replacement')") };
  assert.equal((await run(request)).status, 409);
  assert.equal((await run(request)).status, 409);
  assert.equal((await (await running).json()).exitCode, 0);
  assert.equal((await run(request)).status, 200);
});

test("real generated builds expose a bounded opaque-origin preview and reject unsafe assets", async (t) => {
  const { origin, run } = await fixture(t);
  const result = await (await run({ command: "node main.mjs", files: main("import {mkdirSync,writeFileSync} from 'node:fs'; mkdirSync('dist'); writeFileSync('dist/index.html','<!doctype html><h1>Built preview</h1><script type=\"module\" src=\"/app.js\"></script>'); writeFileSync('dist/app.js','document.body.dataset.built=\"true\"'); writeFileSync('dist/styles.css','h1{color:purple}'); writeFileSync('dist/private.key','secret');") })).json();
  assert.match(result.previewUrl, /^\/api\/project\/preview\/[\w-]+\/dist\/index.html$/);
  const preview = await fetch(`${origin}${result.previewUrl}`, { headers: { Origin: "null", "Sec-Fetch-Site": "cross-site" } });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("content-security-policy")!, /^sandbox allow-scripts;/);
  assert.equal(preview.headers.get("access-control-allow-origin"), "*");
  const html = await preview.text();
  assert.match(html, /Built preview/);
  assert.ok(html.includes(result.previewUrl.replace("index.html", "app.js")), "ordinary Vite root assets load inside their project preview");
  const asset = await fetch(`${origin}${result.previewUrl.replace("index.html", "app.js")}`, { headers: { Origin: "null" } });
  assert.equal(asset.status, 200); assert.match(asset.headers.get("content-type")!, /javascript/);
  const stylesheet = await fetch(`${origin}${result.previewUrl.replace("index.html", "styles.css")}`, { headers: { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "style" } });
  assert.equal(stylesheet.status, 200); assert.match(await stylesheet.text(), /color:purple/);
  assert.equal((await fetch(`${origin}${result.previewUrl}`, { headers: { Origin: "https://evil.example" } })).status, 403);
  assert.equal((await fetch(`${origin}${result.previewUrl.replace("index.html", "private.key")}`)).status, 400);
  assert.equal((await fetch(`${origin}${result.previewUrl.replace("index.html", "%2e%2e%2fmain.mjs")}`)).status, 400);
});

test("binary, non-UTF-8 and linked replacements of approved source mark the file snapshot incomplete", async (t) => {
  const { run } = await fixture(t);
  for (const mutation of [
    "writeFileSync('source.js',Buffer.from([0,1,2]));",
    "writeFileSync('source.js',Buffer.from([0xff,0xfe,0xff]));",
    "unlinkSync('source.js'); linkSync('main.mjs','source.js');",
  ]) {
    const response = await run({ command: "node main.mjs", files: [
      ...main(`import {writeFileSync,unlinkSync,linkSync} from 'node:fs'; ${mutation} console.log('mutation completed');`),
      { path: "source.js", content: "export const source = 'keep the browser copy';" },
    ] });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.exitCode, 0);
    assert.equal(result.filesTruncated, true, mutation);
    assert.ok(!result.files.some((file: { path: string }) => file.path === "source.js"));
    const protectedSnapshot = new Map([{ path: "source.js", content: "export const source = 'keep the browser copy';" }, ...result.files].map((file: { path: string; content: string }) => [file.path, file.content]));
    assert.equal(protectedSnapshot.get("source.js"), "export const source = 'keep the browser copy';");
  }
  const linkedFolder = await (await run({ command: "node main.mjs", files: [
    ...main("import {unlinkSync,rmdirSync,mkdirSync,writeFileSync,symlinkSync} from 'node:fs'; import {resolve} from 'node:path'; unlinkSync('src/source.js'); rmdirSync('src'); mkdirSync('replacement'); writeFileSync('replacement/source.js','linked output'); symlinkSync(resolve('replacement'),'src',process.platform==='win32'?'junction':'dir');"),
    { path: "src/source.js", content: "export const original = true;" },
  ] })).json();
  assert.equal(linkedFolder.exitCode, 0);
  assert.equal(linkedFolder.filesTruncated, true, "linked parent folders cannot disguise approved-source omissions as deletions");
  assert.ok(!linkedFolder.files.some((file: { path: string }) => file.path === "src/source.js"));
});

test("actual deletion of approved source returns a complete snapshot so it can be reviewed as a deletion", async (t) => {
  const { run } = await fixture(t);
  const result = await (await run({ command: "node main.mjs", files: [
    ...main("import {unlinkSync,writeFileSync} from 'node:fs'; unlinkSync('obsolete.js'); writeFileSync('generated.bin',Buffer.from([0,1,2])); console.log('removed obsolete source');"),
    { path: "obsolete.js", content: "export const obsolete = true;" },
  ] })).json();
  assert.equal(result.exitCode, 0);
  assert.equal(result.filesTruncated, false, "new binary artifacts do not hide the real deletion of an approved source");
  assert.ok(!result.files.some((file: { path: string }) => file.path === "obsolete.js"));
  assert.ok(!result.files.some((file: { path: string }) => file.path === "generated.bin"));
});
