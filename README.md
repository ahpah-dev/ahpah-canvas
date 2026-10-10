# AhPah Canvas

An open source agentic coding workspace with real project files, a syntax highlighted editor, visible agent actions, reviewed changes, and previews. Run **local Ollama models without hosted API quotas**, or connect **Codex with your ChatGPT subscription**, OmniRoute, **9router**, Kilo AI Gateway, or your own OpenAI compatible API. Use **Code** to build software and **Canvas** to keep planning, conversations, and project context in view.

[Open the live site](https://ahpah-dev.github.io/ahpah-canvas/) · [Source on GitHub](https://github.com/ahpah-dev/ahpah-canvas) · [MIT license](LICENSE)

[Quick start](#start-locally) · [Coding workflow](#build-a-project) · [Canvas and PC saving](#canvas-coding-and-automatic-pc-saving) · [Providers](#connect-a-provider) · [Appearance and shortcuts](#appearance-and-keyboard-controls)

## Features

### Code: build, inspect, review, preview

- A persistent project explorer with file filtering, source-folder/file imports, and ZIP downloads of accepted or proposed source.
- A syntax highlighted editor with line numbers, language and cursor status, two-space indentation, browser autosave, and literal Find/Replace with case matching, match navigation, and undoable replacements.
- **Build** mode for agentic implementation and **Explain** mode for read-only project questions. Vibe Coder plans, inspects real files, searches source, and proposes changes with visible activity and usage.
- **Code, Changes, Preview, and Terminal** panels. Review individual files or an entire change set, preserve manual edits through conflict checks, discard proposals, and undo accepted changes.
- An isolated HTML/CSS/JavaScript preview with desktop/mobile views, entry selection, reload, missing-resource diagnostics, and captured runtime errors.
- Supported Node/npm commands with explicit approval, real output, review of generated files, and compiled previews after a supported build.
- A keyboard command palette for files and project actions, plus a compact, searchable provider/model picker anchored beside the task composer. Search model IDs, provider names, or local/hosted routes and select with the keyboard.
- **Build a feature, Fix an issue, and Understand the code** task starters prepare an editable prompt without sending a model request. A compact project menu groups new-file, import, ZIP, and HTML actions while keeping **Save to PC** visible.

### Canvas: project context and specialized agents

- An infinite workspace with drag, resize, pan, zoom, a minimap, card arrangement, Mission Control, linked cards, and shared project memory.
- Agent names, saved working instructions, and **Software engineer, Interface designer, Backend engineer, Project planner, Code reviewer, and Custom specialist** roles that guide actual coding runs.
- A separate persistent source project per agent card, visible file/tool results, source inspection, and **Open in Code** to continue with the editor.
- Automatic recovery of saved coding runs after a page refresh, preserving the goal, source checkpoint, agent identity, and consumed request budget.
- Notes with persistent checkboxes, embedded website previews, saved command snippets, workspace import/export, and browser-local persistence.
- A bottom command bar for typed prompts and optional voice dispatch in browsers with speech recognition support.
- A searchable **Add card** menu for coding agents, configured models, notes, previews, and command tools. Mission Control searches names, roles, providers, model IDs, and statuses; press Enter to focus a matching card.
- **Canvas commands** launch cards, focus named agents, and route tasks with `@Agent Name`. Type or dictate a command, review its action preview, then submit. Opening/focusing cards costs no model tokens; named tasks go to one agent and retain its request limits.

#### Direct your canvas by name

Open **Canvas → Commands** or press **Ctrl / ⌘ K**. The menu uses your configured provider routes and current agent names:

| Command | Action |
| --- | --- |
| `/open Codex` or `open Kilo` | Create and focus an idle coding agent. Connect its model in Settings if needed. |
| `/open preview`, `/open notes`, `/open terminal` | Add a browser preview, project note, or command scratchpad. |
| `/focus Mary` | Focus a card named Mary without starting a run. |
| `@Mary Fix the API response handling` | Send that task to Mary only, after you submit. |
| `tell Mary to Review App.tsx` | Address a named agent while preserving the original task text. |
| `/settings` | Open model connections. |

Menu buttons prepare commands without executing them. Unknown or ambiguous `@` names are blocked; requests are not silently sent to a different agent. Dictation requires browser speech-recognition support and microphone permission, and never submits automatically. Typing works without speech recognition.

### Your computer: real files and automatic delivery

- A connected PC folder shared by Code and Canvas, with a remembered directory handle and reconnection controls.
- Canvas source automatically delivered after a successful source review; **Save to PC** copies accepted Code files into a separate project folder.
- HTML export that bundles local CSS/JavaScript into a single real file, including requests such as **Export the game "HATE" to my PC as HTML**.
- A persistent save queue for disconnected folders, pending-path visibility, retry/clear controls, conflict protection, and previous versions in **`.ahpah-backups/`**.

### Models: local AI, Codex, gateways, and custom APIs

- Local Ollama setup that detects actual installed models, installs/starts the official Windows runtime when requested, and downloads explicitly chosen models with progress and cancellation.
- Codex in **Code**, **Canvas**, and **Add card**, with one-click local ChatGPT connection, live model selection, and native workspace tool calls.
- One-click OmniRoute installation, startup, connection, live catalog loading, and coding compatibility checks of eligible free routes.
- Native **9router** support in Code, Canvas, Add card, and Canvas Commands: an independent URL/key/model connection, live models and routing combos, streamed answers, and validated native coding tools. Catalog discovery sends no completion probes.
- Live model search by name, ID, and provider; free/paid/unverified filters; current catalog ordering; and exact model-ID import when discovery does not list a selection.
- Kilo Auto Free routing with live zero-price evidence, bounded recovery, advertised instant/low-reasoning variants, and preservation of source and tool results when a route fails or repeats work.
- Named OpenAI compatible API profiles with a base URL, optional API key, chosen model, and streaming preference.
- Local-model context limits, small source sections, checked appends, safe cutoff continuation, compatible native-call conversion, and capped response-format repair.
- Shared request budgets, cancellation, loop detection, and opt-in hosted automatic setup to limit unnecessary inference requests.

### Interface, accessibility, and performance

- A redesigned studio landing page with an editorial hero, interactive engineering showcase, and direct Code, Canvas, and setup entry points. Neutral materials, stronger typography, and quieter controls carry across the workspaces while preserving Code’s explorer/editor/agent layout.
- A smooth workspace reveal on the landing page, restrained button/dialog feedback, responsive panels, and visible focus states.
- **Midnight, Graphite, and Daylight** themes, custom accents, dots/lines/no grid, and **Smooth, Subtle, or No animations** motion preferences that respect reduced-motion settings.
- **Quick start** takes you directly to local-model or hosted-provider setup. Settings includes shortcuts to Local AI, Codex, OmniRoute, 9router, Kilo, and custom APIs, with **Save changes** and **Close** always visible while connection settings scroll.
- Starter projects, keyboard navigation, useful empty states, compact task controls on shorter windows, and automatic dark/light button text for custom accents.
- Canvas gestures batched once per animation frame, memoized conversations, buffered workspace saves, and streaming scroll that lets you read earlier messages.

## Choose how to run

| Connection or capability | Local app | GitHub Pages |
| --- | --- | --- |
| Editing, source review, HTML previews, ZIP downloads | Yes | Yes |
| Connected PC folder and queued delivery | Supported desktop browsers | Supported desktop browsers |
| Local Ollama setup and inference | Yes | Requires the local app |
| Codex with ChatGPT sign-in | Yes | Requires the local app |
| Kilo AI Gateway | Yes, through the included bridge | Requires the local app |
| OmniRoute, 9router, or custom compatible APIs | Yes | HTTPS endpoints with browser CORS support |
| Approved Node/npm execution and compiled previews | Yes | Requires the local app |

The workspace is free and MIT licensed. Local inference has no hosted API quota; hardware capacity, runtime context, and bounded agent runs still apply. Hosted providers and ChatGPT subscriptions retain their own prices, access rules, and limits.

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

Use **Quick start** in the workspace top bar for the model → project → build walkthrough. Its local and hosted choices open the appropriate Settings section. Use the provider shortcuts at the top of **Settings → Connections** to reach Local AI, Codex, OmniRoute, Kilo, or your custom API. The OmniRoute shortcut opens its one-click installation and connection controls.

### Free coding without hosted API quotas

1. Run the local app with **Start AhPah.bat** or `npm run dev`.
2. Open **Settings**. The **Local AI. No API quotas.** panel reads your PC's actual installed models without making a generation request.
3. If needed, click **Set up Ollama**. On Windows this uses the official `Ollama.Ollama` package from the checksum-verifying WinGet source and starts the loopback runtime. If WinGet is unavailable, install the runtime from [Ollama's official download page](https://ollama.com/download), then retry. macOS/Linux users install Ollama from that page first.
4. Choose an installed model, or expand **Download another local model** and explicitly download a model from [Ollama's library](https://ollama.com/library). Downloads show progress and can be stopped/resumed. The in-app downloader supports up to 32 GB; larger models can be installed separately with Ollama.
5. Click **Use in Code** to select that exact local model, or **Add Canvas agent** to create a card using it. No API key is needed. Local model requests use the app's local bridge, so Ollama does not need public exposure or broad browser CORS settings.

The app and Ollama runtime are free; model license terms still apply. Local inference has no hosted request/token quota or per-token bill. Available RAM/VRAM, electricity, model quality, and processing speed determine what your PC can run. Cloud/remote Ollama tags are excluded from this setup. The agent still uses bounded runs and file review to prevent loops; a stopped run retains staged work for review and continuation.

Local coding uses compact context and small source sections to leave room in the runtime's context window. Larger JavaScript/CSS files can be extended with checked append offsets; requested HTML exports still bundle local assets. A cutoff preserves complete validated actions and asks for a smaller section. See [Request limits and recovery](#request-limits-and-recovery) for the current budgets and safeguards.

Ollama coding requests explicitly use JSON output with native tool calling disabled. Compatible native replies still pass through workspace validation, including object arguments and standard namespaced/camelCase tool names. An unsupported local tool batch executes nothing and can be corrected at most twice within the same run budget; the error identifies the unsupported name.

Choose a model that fits your PC's RAM/VRAM, allowing additional memory beyond the model weights. Consult [Ollama's model library](https://ollama.com/library) for current downloads and model details. Download suggestions are separate from installed-model entries; the picker lists only models actually returned by your local runtime.

The GitHub Pages site serves the browser app; it cannot install software or run local HTTP inference on your PC. Its settings link to the local setup instructions. Hosted APIs, Kilo routes, and Codex subscriptions keep their provider/account limits. Nothing in AhPah bypasses them. Hosted auto setup is opt-in on new installations, and opening settings does not spend hosted inference quota by default.

### Connect Codex with your ChatGPT plan

Open **Settings → Connections & auto setup → Hosted & custom providers → Connect with ChatGPT** in the local app. It detects an installed Codex CLI (including the Windows Codex app), or installs the official `@openai/codex` package in the ignored `.ahpah-tools` folder. An existing ChatGPT sign-in is reused; otherwise complete OpenAI's sign-in in the tab it opens. The connection is detected automatically after sign-in. No API key or credential file is copied into the browser.

The model picker loads Codex's current catalog and selects its reported default. Choose a model, then **Use Codex in Canvas** to add/focus a coding card and leave demo mode. You can also create a Codex card from **Canvas → Add card → Codex agent**. Codex is also available in the Code provider picker. Your ChatGPT plan's eligibility, model access, and shared usage limits apply. Catalog visibility is not proof of model entitlement.

The local bridge uses official Codex app-server authentication and native dynamic tool calls for coding. Each run keeps one ephemeral Codex thread: workspace tool requests go to AhPah's validated project runtime, and actual results return to that same thread. Codex's final prose is not parsed as an action envelope. This uses the app-server's experimental dynamic-tools interface and requires a current compatible Codex CLI. Free-text explanation requests use `codex exec` and include the current prompt with conversation context.

Native shell/app tools are disabled, and coding threads use read-only sessions in an empty temporary folder. AhPah's registered workspace tools perform edits and retain its normal review/command approval flow. **Stop** and completed runs close their Codex session. The GitHub Pages site cannot execute Codex on your PC; launch **Start AhPah.bat** to use this connection.

## Build a project

1. Open **Code** and choose a configured provider. Use **Settings** to add an API profile or choose a live model.
2. Start from the included project or import a source folder/files. Open a file to edit it directly.
3. Describe a concrete goal, such as “Add a search field and a useful empty state.” Start the agent and watch its plan and actual file actions.
4. Review the proposed changes. Apply the files you want, keep your manual edits when a conflict is detected, or discard a proposal. **Undo** restores an applied change when the current files still match it.
5. Open **Preview** to inspect the project. Download a ZIP when you want to continue in another editor.

Use **Build** when you want source changes and **Explain** when you want an answer about the existing project without editing it. The composer shows the configured model for the next run and the applicable request/time budget. The **Commands** palette opens files, Find/Replace, provider settings, preview, and other workspace actions.

The Code workspace saves edits in this browser. Use **Save to PC** to copy the current project into `code/<project-name>-<id>/` under your connected folder. If no folder is connected yet, the files stay queued on this device and save when you connect one. Unreviewed agent changes are excluded. Existing PC files that AhPah has not saved before are preserved and reported as conflicts.

The agent operates on the project files held by this workspace. It can list, read, search, write, replace text, and delete files through validated app tools. Writes and deletions are staged for review. A run has a bounded iteration count and deadline; **Stop** cancels the model request and preserves work already staged.

Imported projects support up to **200 text files**, **256 KB per file**, and **2 MB total**. Generated folders, `.git`, `node_modules`, private `.env` files, and key files are excluded. Importing copies source into the workspace; applying a proposal does not edit the original folder on your computer.

### Canvas coding and automatic PC saving

Click the **pencil icon** in an agent card's header to give it a name, select a specialization, and add working instructions. Custom specialists can have their own role label. Agent identities persist with your workspace and travel with workspace exports; existing cards start with the software engineer specialization. Specialization guides the model's work while preserving the normal tool, source review, and command approval rules.

Open **Connect folder** in the workspace's top bar, choose a local folder, and grant read/write permission. Desktop Chrome and Edge support this connection on localhost and the HTTPS Pages site. The directory handle is remembered in IndexedDB; if the browser revokes permission, click **Reconnect folder** before exporting again.

Canvas now runs a bounded engineering tool loop. Describe the app, game, feature, or fix directly in an agent card. The agent plans, inspects files, writes or patches actual source, reads its changes for review, and finishes with an implementation summary. Tool results come from the application. Invalid actions and unresolved tool failures are fed back to the model; incomplete runs keep partial source for continuation without automatically delivering it to the PC. Coding questions can finish without changing files.

### Refresh recovery

Active Canvas coding runs save their goal, agent identity, source project, and consumed request count in IndexedDB. After a refresh, eligible checkpoints resume automatically for cards still in the workspace. Saved request counts carry over, so a reload does not grant a fresh request budget. Checkpoints expire after 24 hours; **Stop** ends the run and keeps prepared source.

Recovery runs while the app is open. A refresh may interrupt the current provider request; the app continues from the last saved source checkpoint rather than claiming that an unfinished response executed. Closing the browser does not create a background worker. This recovery applies to Canvas coding runs; Code retains its saved project and proposed changes.

### Folder delivery and HTML export

Connecting a PC folder now opens its **file browser** automatically. Click the folder name in the top bar to reopen it, or use **Browse connected folder** in the Code explorer. All directory entries are shown, including subfolders, images, hidden files, dependencies, and backups. Navigate with folder rows and breadcrumbs, search the current directory, and use **Refresh files** after changing files outside AhPah. Large directories are paginated rather than truncated; AhPah saves refresh the listing automatically.

Select a file to view its actual contents directly in AhPah. UTF-8 text has a read-only preview up to **2 MB**, and common image formats have an inline preview up to **20 MB**. Other or larger files still appear with metadata and a **Download** action. HTML and scripts are displayed as source, without running them. The browser reads a file only when selected, and does not add it to a project or send it to a model. Use Code's explicit import controls when you want source included in a coding task.

Completed source projects automatically save under **`canvas/<project-id>/`** in your connected folder. Each card owns a separate project so parallel agents do not overwrite one another. HTML, CSS, JavaScript, Python, TypeScript, and other supported text source can be delivered. Open **Project files** in a card to inspect actual contents, or choose **Open in Code** to import the project into the editor after preserving your current Code project. Accepted or manual Code edits to that Canvas project also sync automatically. PC files deleted from the editor are retained on disk; Canvas does not automatically delete PC files.

If no folder is connected or permission has expired, ready source waits in IndexedDB on this device and saves when you choose or reconnect a folder. The queue survives reloads and disconnects, supports up to **210 files / 24 MB**, and shows pending paths in the folder panel. Newer queued content replaces older content at the same path. Use **Retry saving** after resolving a file conflict, or **Clear queue** to cancel pending delivery; source projects remain available. Saying not to save disables automatic saving for that run.

For an existing game, ask **Export the game "HATE" to my PC as HTML**. Complete source from this card's project or earlier conversation exports as **HATE.html** in the connected folder. If the provider previously returned only a creation claim or truncated code, the agent must implement the missing source from the conversation and validate it before exporting. Recovery does not recover an unavailable original file. Missing local resources or an incomplete HTML document prevent an automatic game export. External URLs still require a connection.

In Code, **Save HTML** bundles the selected HTML entry and its local CSS, JavaScript, and text assets into one file. The coding agent can use `export_html` for an explicitly requested save/export. Exports of proposed files do not apply those edits to the editor.

The app reports a PC save only after the writer closes successfully. General source saving refuses to overwrite unrelated files or source edited outside the app. Replaced files keep unique versions under **`.ahpah-backups/`**. Browser directory writes cannot make a multi-file batch atomic; if an IO failure interrupts delivery, the error lists the files already saved. HTML exports may replace their selected filename with a backup. The connected folder supports browsing and automatic delivery; unrelated file contents are read only when selected for preview, and are not sent to model providers. Source created in Canvas and included in workspace exports travels with the workspace.

### Tool calling

Codex uses native workspace tool calls. OmniRoute, 9router, and supported Kilo routes can return native calls that are converted into the same validated project actions. Ollama coding explicitly requests JSON actions, with compatibility handling for native replies. Custom text providers use the JSON action protocol.

| Action | Purpose |
| --- | --- |
| `plan` | Set a concrete implementation plan. |
| `list_files`, `search_files` | Inspect the real project manifest or search literal source text. |
| `read_file` | Read actual source with line ranges; local JSON coding also supports character ranges for long/minified lines. |
| `write_file`, `replace_in_file` | Prepare complete files or unique exact replacements while protecting existing work. |
| `append_to_file` | Add a small source section using the actual current character count; local coding uses this to build larger files without repeating earlier sections. |
| `delete_file` | Stage a deletion for review in Code; Canvas prevents automatic PC deletion. |
| `run_command` | Queue a supported command for explicit approval in Code. |
| `save_files` | Validate reviewed Canvas source for delivery; it does not itself confirm a PC write. |
| `export_html` | Bundle and save a complete HTML project when the user requests an export. |
| `finish` | Summarize actual work and source review, and complete eligible Canvas delivery. |

Code source changes stay proposed until accepted. Canvas source is delivered only after successful review; queued delivery is reported separately from a confirmed PC save. A command proposal never approves or executes itself.

### Request limits and recovery

| Run | Request/step ceiling | Run deadline | Actions per response |
| --- | --- | --- | --- |
| Hosted providers and Codex | 12 | 10 minutes | 8 |
| Local Ollama coding | 24 | 20 minutes | 8 |

Provider attempts and format repairs count toward the shared request budget. Hosted completions have a three-minute deadline; an individual local Ollama completion can take up to ten minutes within the run deadline. The composer shows the applicable budget, and **Stop** cancels the current request while preserving prepared source. Switching a profile to a hosted endpoint cannot inherit the larger local request allowance.

Local coding uses an 11,000-byte context budget, a maximum 4,096-token response budget, and source sections of up to 4,000 characters. Complete validated actions can survive an output/context cutoff; incomplete arguments and truncated writes are discarded. Consecutive cutoffs without progress and response-format correction are each capped at two recovery attempts. Partial reads expose continuation offsets and cannot count as a completed source review.

Repeated plans, unchanged rewrites, redundant inspections, and source cycles are detected. Eligible free routing can make one run-local switch after repeated actions without progress; a continuing loop stops and keeps prepared source. Unknown tools, invalid paths, ambiguous replacements, malformed model output, cancellation, and folder failures remain real errors. The app does not claim runtime verification without actual command output.

### Preview and local commands

Plain HTML/CSS/JavaScript projects can preview in an isolated iframe using local project resources. Preview diagnostics identify missing resources and runtime errors. The preview has an opaque origin and cannot read the app's browser storage. Remote resources still depend on their own availability and browser policies.

React, TypeScript, and other projects that require compilation need the local app and a supported build command. An approved build can expose its generated `dist` or `build` output as a compiled preview.

The agent may propose a command, but it cannot approve one. Review the exact command and click **Approve & run** yourself. Supported commands include `node <relative file>`, `node --check <relative file>`, `npm install`, `npm ci`, and `npm run <script>`. Commands run with a two-minute limit and bounded output; changed text files return as another proposal for review.

Execution uses a dedicated ignored `.ahpah-projects/<id>` folder. It runs actual Node/npm code on your computer with your user permissions; this directory is not an operating-system sandbox. Review scripts and dependencies before approving them. Git commands, deployment commands, and unrestricted shell commands are not provided.

## Connect a provider

Open **Settings → Connections** from either workspace. Custom profiles are under **Bring your own API**; **Save & add card** also creates a canvas conversation card. Configured profiles with a selected model are available to the Code workspace.

### OmniRoute

Enter your gateway's OpenAI compatible base URL, such as `http://localhost:20128/v1`, and its API key if required. Load the live catalog, choose a model, and save your configuration.

**One-click OmniRoute setup** installs the official `omniroute@latest` package if missing, starts or reuses the standard local gateway, loads its current catalog, checks real coding actions and saves a working concrete free route. Remote gateways and custom ports use your existing deployment. If the gateway requires an API key, enter that gateway key in Settings. This is separate from provider account credentials managed inside OmniRoute.

Setup checks up to six current free text routes, trying different providers first and skipping a provider's other models when its credentials or quota are unavailable. It excludes virtual routers, paid models and retired models. **Load live models** refreshes the catalog; it does not claim that every listed provider works. Exact model IDs can be imported manually and stay selected when the catalog is refreshed. Automatic configuration preserves explicitly selected paid or price-unverified models.

The model picker searches model names, exact IDs, and provider names. Use **All**, **Free**, **Paid**, or **Unverified** filters, refresh the live catalog, or import an exact model ID. Catalog visibility does not confirm usable provider credentials or entitlement; connect that provider in OmniRoute when required. The compact Code picker selects among the routes you have already configured.

OmniRoute coding requests stream answers and declare Canvas's real file, search, edit and command-proposal tools. Native function calls are converted into validated Canvas actions with the same staging and human command approval rules. Existing free automatic selections such as `auto/coding:free` resolve to concrete free catalog routes, can fall back across providers and keep the working route during a coding run. Manually selected models are never silently replaced.

**OpenCode Free needs no account API key.** Its upstream requires a compatible tool-carrying request. Canvas supplies the coding tools, and gateways started by this app also receive OmniRoute's official placeholder-tool configuration for dashboard checks. A previously rejected connection may remain in cooldown; check its status in **OmniRoute → Providers** before retrying. Other providers may require sign-in, keys, local software or a browser runtime. See the [maintainer's prerequisites explanation](https://github.com/diegosouzapw/OmniRoute/discussions/15232) and [OpenCode request contract guidance](https://github.com/diegosouzapw/OmniRoute/discussions/14139).

### 9router

Open **Settings → Connections → 9router**. This is a dedicated native provider, so its connection and selection are saved independently of OmniRoute and custom APIs.

1. Install and start the official gateway:

   ```sh
   npm install -g 9router
   9router
   ```

2. In the [9router dashboard](http://localhost:20128/dashboard), connect your upstream providers and copy a gateway API key.
3. Enter the API base URL (default `http://127.0.0.1:20128/v1`) and gateway key in AhPah. A server root URL is normalized to `/v1`; dashboard URLs are rejected.
4. Click **Check & load models**, choose a live model or routing combo, then **Use in Code** or **Add to Canvas**. You can also import an exact ID through the model selector. Saved selections appear in the Code provider picker; **Add card → 9router agent** and `/open 9router` open a Canvas agent.

**Authentication:** enter an active gateway key generated by the same 9router instance at your API URL. Upstream provider keys belong in 9router's **Providers** page. AhPah trims surrounding whitespace, copied quotes, and an optional `Bearer` prefix before saving or sending the token. Keys with internal whitespace are rejected with a specific message. Save changes or use one of the destination buttons after editing; closing settings alone does not apply draft credentials.

Discovery first checks connection authentication with a request that omits the model. 9router checks its gateway key before rejecting that request with `Missing model`, without contacting an upstream provider. A model catalog alone does not prove authentication. AhPah then uses `GET /v1/models`, keeps the catalog's exact model/combo IDs, and does not spend completion tokens or select a model for you. Coding uses streamed OpenAI-compatible completions and AhPah's native file, search, edit, and command-proposal tools. Tool proposals follow the existing validation, staged review, and command approval rules. Coding requests bypass 9router's token-saver modifiers to preserve source and action instructions.

If a coding request returns HTTP 401, one connection check distinguishes rejection of the gateway key from an upstream provider authentication failure. It does not retry generation or switch routes. Follow the error's instructions for the matching 9router instance or provider account.

9router manages its own combo routing and fallback. AhPah sends your selected ID without replacing it with Kilo or OmniRoute routes. Hosted request/time limits and Canvas refresh checkpoints also apply to 9router. Upstream account limits, eligibility, and pricing still apply; catalog visibility alone does not prove access or zero pricing.

**Port collision:** 9router and OmniRoute both default to `20128`. Run them on different ports if using both, and enter each API URL separately. The local app includes the 9router bridge for gateways without browser CORS support. GitHub Pages requires an HTTPS endpoint that permits browser requests; it cannot start a local gateway. See [9router's official documentation](https://github.com/decolua/9router) for gateway installation and provider configuration.

### Kilo AI Gateway

The default route is `kilo-auto/free`. Load Kilo's current catalog to choose another supported text model. Paid models require the credentials and credits specified by Kilo; availability and rate limits are controlled by the provider.

Coding requests use Kilo's native tools when the live model catalog advertises support. Tool calls pass through the same validated project actions, review, and command-approval rules. Incomplete or malformed tool proposals are never executed. Auto Free can retry a verified free route for an empty or unusable structured response before visible answer text starts; partial text is preserved as soon as it streams. Requests carry a stable task ID across coding steps. Authentication, account balance, permission, and rate-limit errors include next steps and are surfaced without blind retries.

Auto Free waits up to 30 seconds for the first answer and can try up to three routes within a shared three-minute deadline. Recovery only uses live text models with explicit zero prices, excluding retiring and retired models. A route that stalls is skipped for five minutes in the current session. After visible answer text starts, a partial answer is kept rather than replaced by another attempt. Authentication, account balance, permission, rate-limit, refusal, and transport errors stop route rotation with an actionable hint. Structured coding proposals may use bounded free-route recovery before visible text starts.

**Verify Auto Free** and automatic setup check structured coding actions instead of accepting a plain “READY” reply. Coding runs keep the effective model when the live catalog confirms it is free. Malformed complete coding replies and repeated actions can switch to another verified free route while keeping the goal, real tool results, and current source. Recovery is bounded; if no route makes progress, the run stops early and retains staged files. Identical rewrites preserve source review, and repeated exports of the same source reuse the confirmed delivery result.

Directly selected free Kilo coding models use their catalog-advertised instant or low-reasoning variant when available. If a selected coding model repeats actions without progress and the live catalog confirms zero pricing, the run can switch to another verified free route without changing the saved selection. The replacement keeps the goal, real tool results and staged source, and gets a fresh inspection before repetition detection resumes. Routes that loop are skipped by Auto Free for five minutes in the current session. At most one run-local loop recovery is allowed; paid and price-unverified selections never qualify.

If Auto Free's effective model exhausts the token budget without producing an answer and offers a verified free instant mode, recovery can retry that exact model with thinking disabled before trying another route. The same conversation and token ceiling are preserved; partial answers, paid selections, and cancellation are not silently replaced.

### Custom API providers

Add a named provider profile with your API base URL, optional API key, and model. A compatible provider exposes `POST /chat/completions` and, for catalog discovery, `GET /models` below that base URL. If the provider does not expose a model catalog, enter its exact model ID manually. Enable streaming only when the provider supports OpenAI style server-sent events.

Use one custom profile per provider or endpoint. Keys are sent to the endpoint you configure. Review that URL before entering a credential.

### Automatic configuration

**Auto configure** discovers the built-in providers, loads fresh catalogs, and checks eligible free routes with a small prompt before saving a working configuration. OmniRoute discovery tries the configured URL, `/v1` when needed, and the equivalent loopback hostname. It does not scan your network, install software, or obtain account keys. Failed providers keep their existing settings, and paid routes are not automatically probed.

Hosted setup on opening Settings is **opt-in** for new installations; existing explicit preferences are preserved. Local model detection reads the installed catalog without generating an answer. **Auto configure**, **Verify Auto Free**, and one-click OmniRoute setup perform small inference checks when requested, so hosted provider quotas still apply to those checks.

## Live site and browser connections

The [GitHub Pages site](https://ahpah-dev.github.io/ahpah-canvas/) is a static application. Its API requests go directly from your browser to the selected provider. Project editing, agent file actions, reviews, HTML/CSS/JavaScript previews, and ZIP download run in the browser. Node/npm execution and compiled project previews require the local app.

For direct connections, the provider must support browser **CORS** for the site's origin, including the authorization header when a key is supplied. An HTTPS site also needs HTTPS provider endpoints. If a provider rejects browser requests or your service runs locally over HTTP, run the canvas locally and use its included bridge. Provider error messages help distinguish missing credentials, an unsupported endpoint, and browser connection failures.

Kilo's API did not return CORS headers when checked on October 5, 2026. Use the local app for Kilo; the Pages version displays this requirement. Automatic built-in gateway setup is available in the local app. Browser-compatible custom APIs can be configured on Pages.

## Data and credentials

Project files, canvas content, appearance, and API profiles are saved in this browser's local storage. API keys are not encrypted there. Use a personal browser profile, and remove credentials on a shared device. Keys are forwarded only to the provider selected for a request; workspace exports exclude API configuration and credentials.

In Code, the goal, file listing, inspected source, and prior tool results are sent to the selected model provider. Canvas coding runs include their conversation context, shared project memory, inspected source, and real tool results. Local approved commands mirror the current project into the dedicated project directory. The app includes no analytics or hosted workspace storage.

## Appearance and keyboard controls

Open **Settings → Appearance** to choose **Midnight**, **Graphite**, or **Daylight**, set an accent color, switch between dots/lines/no canvas grid, and select **Smooth**, **Subtle**, or **No animations**. Preferences persist in this browser. Motion also respects the operating system's reduced-motion setting.

The landing page includes a workspace reveal animation, and dialogs/buttons use restrained interaction feedback. The Code interface keeps its explorer/editor/agent arrangement with refined materials, a clear Build/Explain composer, and a compact provider popover that follows its trigger when the viewport moves.

### Code shortcuts

| Action | Control |
| --- | --- |
| Open the command palette | **Ctrl/Cmd + K** |
| Open a project file by name/path | **Ctrl/Cmd + P** |
| Find in the current source file | **Ctrl/Cmd + F**, with the editor focused |
| Open replacement controls | **Ctrl/Cmd + H**, with the editor focused |
| Next / previous search match | **Enter / Shift + Enter** in Find; **F3 / Shift + F3** in the editor |
| Submit the Build or Explain goal | **Ctrl/Cmd + Enter** in the composer |
| Navigate a palette or model list | **↑ / ↓**, then **Enter** to choose |
| Close a dialog or picker | **Esc** |

### Canvas controls

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
