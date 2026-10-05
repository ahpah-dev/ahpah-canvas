import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProjectPreview } from "../src/utils/projectFiles.ts";

test("inline project modules resolve relative imports through the same isolated import map as external modules", () => {
  const preview = buildProjectPreview([
    { path: "pages/index.html", content: '<html><head></head><body><script type="module">import {answer} from "../lib/utils.js"; document.body.textContent = String(answer);</script></body></html>' },
    { path: "lib/utils.js", content: 'import "./setup.js"; export const answer = 42;' },
    { path: "lib/setup.js", content: "export {};" },
  ], "pages/index.html");
  assert.deepEqual(preview.issues, []);
  assert.ok(preview.html.includes('from "ahpah-project/lib/utils.js"'));
  assert.ok(preview.html.includes('"ahpah-project/lib/utils.js":"data:text/javascript'));
  assert.ok(preview.html.includes("ahpah-project%2Flib%2Fsetup.js"));
});

test("inline module diagnostics identify missing project resources without changing classic scripts", () => {
  const preview = buildProjectPreview([{ path: "index.html", content: '<script type="module">import "./missing.js";</script><script>const sample="./plain.js";</script>' }]);
  assert.ok(preview.issues.some((issue) => issue.includes("missing.js")));
  assert.ok(preview.html.includes('const sample="./plain.js";'));
});
