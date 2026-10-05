# AhPah Canvas

A polished infinite canvas for live AI conversations, project notes, browser previews, and shared context. Connect OmniRoute, Kilo AI Gateway, or your own OpenAI compatible API, then organize everything in one workspace.

[Open the live site](https://ahpah-dev.github.io/ahpah-canvas/) · [Source on GitHub](https://github.com/ahpah-dev/ahpah-canvas) · [MIT license](LICENSE)

## Features

- Live provider catalogs, searchable model selection, and free or paid labels. Model IDs come from the connected provider rather than a bundled mock list.
- Named custom API profiles with a base URL, optional API key, selected model, and streaming preference.
- Streaming conversations with cancellation, retained partial answers, elapsed time, model identity, and reported token usage.
- Kilo Auto Free recovery that checks the live catalog and uses verified free routes when a route stalls or returns an empty answer.
- An infinite canvas with drag, resize, pan, zoom, minimap, card arrangement, and shared project memory.
- Notes, embedded previews, saved command snippets, workspace import and export, and browser-local persistence.
- Midnight, Graphite, and Daylight themes, custom accents, grid styles, and motion preferences that respect reduced-motion settings.
- Click feedback, animated scene tabs and menus, and a cleaner landing page with less repeated navigation.
- Canvas gestures batched once per animation frame, memoized conversations, buffered workspace saves, and streaming scroll that lets you read earlier messages.

## Start locally

Install **Node.js 24 or newer**, then run:

```powershell
git clone https://github.com/ahpah-dev/ahpah-canvas.git
cd ahpah-canvas
npm ci
npm run dev
```

Open the URL Vite prints, usually **http://localhost:5173/**, and choose **Launch canvas**. The local server includes a gateway bridge, allowing connections to providers that restrict browser cross-origin requests.

To preview a production build locally:

```powershell
npm run build
npm run preview
```

Keep the local development or preview server on your machine. Start OmniRoute or another local model server separately; the canvas does not install or launch provider services.

## Connect a provider

Open **Settings → Connections** in the canvas. Custom profiles are under **Bring your own API**; **Save & add card** saves your settings and opens a card for that profile.

### OmniRoute

Enter your gateway's OpenAI compatible base URL, such as `http://localhost:20128/v1`, and its API key if required. Load the live catalog, choose a model, and save your configuration.

### Kilo AI Gateway

The default route is `kilo-auto/free`. Load Kilo's current catalog to choose another supported text model. Paid models require the credentials and credits specified by Kilo; availability and rate limits are controlled by the provider.

Auto Free waits up to 30 seconds for the first answer and can try up to three routes within a shared three-minute deadline. Recovery only uses live text models with explicit zero prices, excluding retiring and retired models. A route that stalls is skipped for five minutes in the current session. After text starts, a partial answer is kept rather than replaced by another attempt. Authentication, billing, rate limits, refusals, invalid responses, and tool-only results stop automatic recovery.

### Custom API providers

Add a named provider profile with your API base URL, optional API key, and model. A compatible provider exposes `POST /chat/completions` and, for catalog discovery, `GET /models` below that base URL. If the provider does not expose a model catalog, enter its exact model ID manually. Enable streaming only when the provider supports OpenAI style server-sent events.

Use one custom profile per provider or endpoint. Keys are sent to the endpoint you configure. Review that URL before entering a credential.

### Automatic configuration

**Auto configure** discovers the built-in providers, loads fresh catalogs, and checks eligible free routes with a small prompt before saving a working configuration. OmniRoute discovery tries the configured URL, `/v1` when needed, and the equivalent loopback hostname. It does not scan your network, install software, or obtain account keys. Failed providers keep their existing settings, and paid routes are not automatically probed.

## Live site and browser connections

The [GitHub Pages site](https://ahpah-dev.github.io/ahpah-canvas/) is a static application. Its API requests go directly from your browser to the selected provider. It has no hosted gateway backend and does not receive your API keys.

For direct connections, the provider must support browser **CORS** for the site's origin, including the authorization header when a key is supplied. An HTTPS site also needs HTTPS provider endpoints. If a provider rejects browser requests or your service runs locally over HTTP, run the canvas locally and use its included bridge. Provider error messages help distinguish missing credentials, an unsupported endpoint, and browser connection failures.

Kilo's API did not return CORS headers when checked on October 5, 2026. Use the local app for Kilo; the Pages version displays this requirement. Automatic built-in gateway setup is available in the local app. Browser-compatible custom APIs can be configured on Pages.

## Data and credentials

Workspace content, appearance, and API profiles are saved in this browser's local storage. API keys are not encrypted there. Use a personal browser profile, and remove credentials on a shared device. Keys are forwarded only to the provider selected for a request; workspace exports exclude API configuration and credentials.

Conversation history and shared project memory are sent to the selected model provider as context. The canvas includes no analytics or server-side workspace storage.

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

Notes support headings, bullets, and persistent checkboxes. Browser previews depend on the embedded site's framing policy. Command snippets can be saved and copied; they do not execute a local shell. Linked cards visualize relationships and do not automatically execute tasks or edit files. Demo simulation is explicitly labeled and off by default.

## Development

```powershell
npm run test
npm run lint
npm run build
```

Regression tests cover canvas geometry, workspace validation, provider requests, streaming, cancellation, errors, model catalogs, free route recovery, preferences, automatic configuration, and the local HTTP bridge. `node tests/gateway-fixture.mjs` starts an optional local verification fixture on port 20129.

## GitHub Pages deployment

The repository's [Pages workflow](.github/workflows/pages.yml) checks, builds, and publishes the site whenever `main` changes. It can also be run manually from GitHub Actions. The build uses `VITE_GATEWAY_TRANSPORT=direct` and relative asset paths so it works under a repository URL.

For your own fork, enable **Settings → Pages → Source → GitHub Actions**. No API keys or deployment secrets are needed. GitHub supplies the workflow's deployment credentials. See GitHub's [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## License

[MIT](LICENSE), copyright © 2026 ahpah-dev. Dependencies retain their own licenses.
