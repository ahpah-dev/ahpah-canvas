# AhPah Canvas

An open source agentic coding workspace with real project files, an editor, visible agent actions, reviewed changes, and previews. Connect **Codex with your ChatGPT subscription**, OmniRoute, Kilo AI Gateway, or your own OpenAI compatible API. Use **Code** to build software and **Canvas** to keep planning, conversations, and project context in view.

[Open the live site](https://ahpah-dev.github.io/ahpah-canvas/) · [Source on GitHub](https://github.com/ahpah-dev/ahpah-canvas) · [MIT license](LICENSE)

## Features

- A persistent project explorer and editor. Start with HTML/CSS/JavaScript files, import your own text source files, and download the finished project as a ZIP.
- A connected PC folder shared by Canvas and Code. Export requests write real HTML files there, including local project CSS and JavaScript, with actual save results and a previous-version backup.
- A real coding agent loop that plans a goal, lists and reads files, searches source, and stages file edits or deletions. Tool activity shows what actually happened.
- File changes remain pending until you review and apply them. Accept individual files or a complete set, detect conflicts with your own edits, and undo applied changes.
- An isolated browser preview for supported HTML/CSS/JavaScript projects, with missing-resource diagnostics and captured runtime errors.
- Explicitly approved Node and npm commands in the local app, real output, generated-file review, and compiled previews after a supported build.
- Live provider catalogs, searchable model selection, and free or paid labels. Model IDs come from the connected provider rather than a bundled mock list.
- Codex in Code and Canvas through your ChatGPT subscription, with one-click local connection, live model selection, and native workspace tool calls.
- Named custom API profiles with a base URL, optional API key, selected model, and streaming preference.
- Canvas coding agents with real list/read/search/write/patch tools, visible action results, persistent source projects, cancellation, and automatic PC delivery after source review.
- Kilo Auto Free recovery that checks the live catalog and uses verified free routes when a route stalls or returns an empty answer.
- Kilo coding compatibility checks, consistent free routing during each agent run, and automatic recovery from repeated actions without discarding staged source.
- An infinite canvas with drag, resize, pan, zoom, minimap, card arrangement, and shared project memory.
- Notes, embedded previews, saved command snippets, workspace import and export, and browser-local persistence.
- Midnight, Graphite, and Daylight themes, custom accents, grid styles, and motion preferences that respect reduced-motion settings.
- A coding-focused landing page, clear Code/Canvas navigation, and restrained feedback and motion.
- Canvas gestures batched once per animation frame, memoized conversations, buffered workspace saves, and streaming scroll that lets you read earlier messages.

## Start locally

On Windows, install **Node.js 24 or newer**, extract or clone the repository, and double-click **Start AhPah.bat**. It installs missing dependencies on the first launch, starts the local server, and opens the app in your default browser. Keep the launcher window open while using the app; press **Ctrl+C** to stop it. The launcher keeps port 5173 fixed so your saved browser workspace stays on the same address.

To start from a terminal instead:

Install **Node.js 24 or newer**, then run:

```powershell
git clone https://github.com/ahpah-dev/ahpah-canvas.git
cd ahpah-canvas
npm ci
npm run dev
```

Open the URL Vite prints, usually **http://localhost:5173/**, and choose **Start coding**. The local server includes a gateway bridge and the approved project command runner. Both the development and preview servers bind to loopback.

To preview a production build locally:

```powershell
npm run build
npm run preview
```

Start OmniRoute or another local model server separately.

### Connect Codex with your ChatGPT plan

Open **Settings → Connections & auto setup → Connect with ChatGPT** in the local app. It detects an installed Codex CLI (including the Windows Codex app), or installs the official `@openai/codex` package in the ignored `.ahpah-tools` folder. An existing ChatGPT sign-in is reused; otherwise complete OpenAI's sign-in in the tab it opens. The connection is detected automatically after sign-in. No API key or credential file is copied into the browser.

The model picker loads Codex's current catalog and selects its reported default. Choose a model, then **Use Codex in Canvas** to add/focus a coding card and leave demo mode. You can also create a Codex card from **Canvas → Add card → Codex agent**. Codex is also available in the Code provider picker. Your ChatGPT plan's eligibility, model access, and shared usage limits apply. Catalog visibility is not proof of model entitlement.

The local bridge uses official Codex app-server authentication and native dynamic tool calls for coding. Each run keeps one ephemeral Codex thread: workspace tool requests go to AhPah's validated project runtime, and actual results return to that same thread. Codex's final prose is not parsed as an action envelope. This uses the app-server's experimental dynamic-tools interface and requires a current compatible Codex CLI. Free-text explanation requests use `codex exec` and include the current prompt with conversation context.

Native shell/app tools are disabled, and coding threads use read-only sessions in an empty temporary folder. AhPah's registered workspace tools perform edits and retain its normal review/command approval flow. **Stop** and completed runs close their Codex session. The GitHub Pages site cannot execute Codex on your PC; launch **Start AhPah.bat** to use this connection.

## Build a project

1. Open **Code** and choose a configured provider. Use **Settings** to add an API profile or choose a live model.
2. Start from the included project or import a source folder/files. Open a file to edit it directly.
3. Describe a concrete goal, such as “Add a search field and a useful empty state.” Start the agent and watch its plan and actual file actions.
4. Review the proposed changes. Apply the files you want, keep your manual edits when a conflict is detected, or discard a proposal. **Undo** restores an applied change when the current files still match it.
5. Open **Preview** to inspect the project. Download a ZIP when you want to continue in another editor.

The agent operates on the project files held by this workspace. It can list, read, search, write, replace text, and delete files through validated app tools. Writes and deletions are staged for review. A run has a bounded iteration count and deadline; **Stop** cancels the model request and preserves work already staged.

Imported projects support up to **200 text files**, **256 KB per file**, and **2 MB total**. Generated folders, `.git`, `node_modules`, private `.env` files, and key files are excluded. Importing copies source into the workspace; applying a proposal does not edit the original folder on your computer.

### Canvas coding and automatic PC saving

Open **Connect folder** in the workspace's top bar, choose a local folder, and grant read/write permission. Desktop Chrome and Edge support this connection on localhost and the HTTPS Pages site. The directory handle is remembered in IndexedDB; if the browser revokes permission, click **Reconnect folder** before exporting again.

Canvas now runs a bounded engineering tool loop. Describe the app, game, feature, or fix directly in an agent card. The agent plans, inspects files, writes or patches actual source, reads its changes for review, and finishes with an implementation summary. Tool results come from the application. Invalid actions and unresolved tool failures are fed back to the model; incomplete runs keep partial source for continuation without automatically delivering it to the PC. Coding questions can finish without changing files.

Completed source projects automatically save under **`canvas/<project-id>/`** in your connected folder. Each card owns a separate project so parallel agents do not overwrite one another. HTML, CSS, JavaScript, Python, TypeScript, and other supported text source can be delivered. Open **Project files** in a card to inspect actual contents, or choose **Open in Code** to import the project into the editor after preserving your current Code project. Accepted or manual Code edits to that Canvas project also sync automatically. PC files deleted from the editor are retained on disk; Canvas does not automatically delete PC files.

If no folder is connected or permission has expired, ready source waits in IndexedDB on this device and saves when you choose or reconnect a folder. The queue survives reloads and disconnects, supports up to **210 files / 24 MB**, and shows pending paths in the folder panel. Newer queued content replaces older content at the same path. Use **Retry saving** after resolving a file conflict, or **Clear queue** to cancel pending delivery; source projects remain available. Saying not to save disables automatic saving for that run.

For an existing game, ask **Export the game "HATE" to my PC as HTML**. Complete source from this card's project or earlier conversation exports as **HATE.html** in the connected folder. If the provider previously returned only a creation claim or truncated code, the agent must implement the missing source from the conversation and validate it before exporting. Recovery does not recover an unavailable original file. Missing local resources or an incomplete HTML document prevent an automatic game export. External URLs still require a connection.

In Code, **Save HTML** bundles the selected HTML entry and its local CSS, JavaScript, and text assets into one file. The coding agent can use `export_html` for an explicitly requested save/export. Exports of proposed files do not apply those edits to the editor.

The app reports a PC save only after the writer closes successfully. General source saving refuses to overwrite unrelated files or source edited outside the app. Replaced files keep unique versions under **`.ahpah-backups/`**. Browser directory writes cannot make a multi-file batch atomic; if an IO failure interrupts delivery, the error lists the files already saved. HTML exports may replace their selected filename with a backup. The connected folder is a save destination; its other files are not automatically read or sent to model providers. Source created in Canvas and included in workspace exports travels with the workspace.

### Tool calling

Codex uses native workspace tool calls; other connected text providers use a validated JSON action protocol. Available coding tools include `plan`, `list_files`, `read_file` (with line ranges), `search_files`, `write_file`, `replace_in_file`, and `finish`. Canvas also supports `save_files` to prepare delivery and `export_html` for requested HTML exports. Source writes happen after successful source review; queued delivery is reported distinctly from a confirmed PC save. Canvas prevents automatic PC deletion. `run_command` queues an exact command for review in Code and never approves or executes it by itself.

Runs allow up to **20 steps**, **8 actions per response**, and **10 minutes**. Unknown tools, invalid paths, ambiguous replacements, incomplete model JSON, cancellation, and folder failures produce real errors. Model reliability and provider availability still determine whether a run can complete; the app does not claim runtime verification without actual command output.

### Preview and local commands

Plain HTML/CSS/JavaScript projects can preview in an isolated iframe using local project resources. Preview diagnostics identify missing resources and runtime errors. The preview has an opaque origin and cannot read the app's browser storage. Remote resources still depend on their own availability and browser policies.

React, TypeScript, and other projects that require compilation need the local app and a supported build command. An approved build can expose its generated `dist` or `build` output as a compiled preview.

The agent may propose a command, but it cannot approve one. Review the exact command and click **Approve & run** yourself. Supported commands include `node <relative file>`, `node --check <relative file>`, `npm install`, `npm ci`, and `npm run <script>`. Commands run with a two-minute limit and bounded output; changed text files return as another proposal for review.

Execution uses a dedicated ignored `.ahpah-projects/<id>` folder. It runs actual Node/npm code on your computer with your user permissions; this directory is not an operating-system sandbox. Review scripts and dependencies before approving them. Git commands, deployment commands, and unrestricted shell commands are not provided.

## Connect a provider

Open **Settings → Connections** from either workspace. Custom profiles are under **Bring your own API**; **Save & add card** also creates a canvas conversation card. Configured profiles with a selected model are available to the Code workspace.

### OmniRoute

Enter your gateway's OpenAI compatible base URL, such as `http://localhost:20128/v1`, and its API key if required. Load the live catalog, choose a model, and save your configuration.

### Kilo AI Gateway

The default route is `kilo-auto/free`. Load Kilo's current catalog to choose another supported text model. Paid models require the credentials and credits specified by Kilo; availability and rate limits are controlled by the provider.

Auto Free waits up to 30 seconds for the first answer and can try up to three routes within a shared three-minute deadline. Recovery only uses live text models with explicit zero prices, excluding retiring and retired models. A route that stalls is skipped for five minutes in the current session. After text starts, a partial answer is kept rather than replaced by another attempt. Authentication, billing, rate limits, refusals, invalid completion envelopes, and tool-only results stop automatic recovery.

**Verify Auto Free** and automatic setup check structured coding actions instead of accepting a plain “READY” reply. Coding runs keep the effective model when the live catalog confirms it is free. Malformed complete coding replies and repeated actions can switch to another verified free route while keeping the goal, real tool results, and current source. Recovery is bounded; if no route makes progress, the run stops early and retains staged files. Identical rewrites preserve source review, and repeated exports of the same source reuse the confirmed delivery result.

Directly selected free Kilo coding models use their catalog-advertised instant or low-reasoning variant when available. If Auto Free's effective model exhausts the token budget without producing an answer and offers a verified free instant mode, recovery can retry that exact model with thinking disabled before trying another route. The same conversation and token ceiling are preserved; partial answers, paid selections, and cancellation are not silently replaced.

### Custom API providers

Add a named provider profile with your API base URL, optional API key, and model. A compatible provider exposes `POST /chat/completions` and, for catalog discovery, `GET /models` below that base URL. If the provider does not expose a model catalog, enter its exact model ID manually. Enable streaming only when the provider supports OpenAI style server-sent events.

Use one custom profile per provider or endpoint. Keys are sent to the endpoint you configure. Review that URL before entering a credential.

### Automatic configuration

**Auto configure** discovers the built-in providers, loads fresh catalogs, and checks eligible free routes with a small prompt before saving a working configuration. OmniRoute discovery tries the configured URL, `/v1` when needed, and the equivalent loopback hostname. It does not scan your network, install software, or obtain account keys. Failed providers keep their existing settings, and paid routes are not automatically probed.

## Live site and browser connections

The [GitHub Pages site](https://ahpah-dev.github.io/ahpah-canvas/) is a static application. Its API requests go directly from your browser to the selected provider. Project editing, agent file actions, reviews, HTML/CSS/JavaScript previews, and ZIP download run in the browser. Node/npm execution and compiled project previews require the local app.

For direct connections, the provider must support browser **CORS** for the site's origin, including the authorization header when a key is supplied. An HTTPS site also needs HTTPS provider endpoints. If a provider rejects browser requests or your service runs locally over HTTP, run the canvas locally and use its included bridge. Provider error messages help distinguish missing credentials, an unsupported endpoint, and browser connection failures.

Kilo's API did not return CORS headers when checked on October 5, 2026. Use the local app for Kilo; the Pages version displays this requirement. Automatic built-in gateway setup is available in the local app. Browser-compatible custom APIs can be configured on Pages.

## Data and credentials

Project files, canvas content, appearance, and API profiles are saved in this browser's local storage. API keys are not encrypted there. Use a personal browser profile, and remove credentials on a shared device. Keys are forwarded only to the provider selected for a request; workspace exports exclude API configuration and credentials.

In Code, the goal, file listing, inspected source, and prior tool results are sent to the selected model provider. Canvas coding runs include their conversation context, shared project memory, inspected source, and real tool results. Local approved commands mirror the current project into the dedicated project directory. The app includes no analytics or hosted workspace storage.

## Canvas controls

| Action | Control |
| --- | --- |
| Move or resize a card | Drag its header or lower-right corner |
| Pan | Drag empty canvas space or select the Pan tool |
| Zoom | Scroll empty space; Ctrl/Cmd + scroll also works over cards |
| Fit the workspace | **F**, outside text fields |
| Zoom in or out | **+ / −**, outside text fields |
| Focus a card | Mission Control or the minimap |
| Send a prompt | The card composer or bottom command bar |
| Cancel a request | **Stop**, preserving partial text |

Canvas notes support headings, bullets, and persistent checkboxes. Embedded website cards depend on the site's framing policy. Canvas command snippets can be saved and copied; execution approvals belong to Code. Linked cards visualize relationships and do not automatically execute tasks. Each agent card retains its own source project; exporting a workspace includes these source projects but excludes folder handles and API configuration. Demo simulation is explicitly labeled and off by default.

## Development

```powershell
npm run test
npm run lint
npm run build
```

Regression tests cover project files, staged edits, agent tools, execution approvals, previews, downloads, canvas geometry, workspace validation, provider requests, streaming, cancellation, errors, model catalogs, free route recovery, preferences, automatic configuration, and the local HTTP bridges. `node tests/gateway-fixture.mjs` starts an optional local verification fixture on port 20129.

## GitHub Pages deployment

The repository's [Pages workflow](.github/workflows/pages.yml) checks, builds, and publishes the site whenever `main` changes. It can also be run manually from GitHub Actions. The build uses `VITE_GATEWAY_TRANSPORT=direct` and relative asset paths so it works under a repository URL.

For your own fork, enable **Settings → Pages → Source → GitHub Actions**. No API keys or deployment secrets are needed. GitHub supplies the workflow's deployment credentials. See GitHub's [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## License

[MIT](LICENSE), copyright © 2026 ahpah-dev. Dependencies retain their own licenses.
