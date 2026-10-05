import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import {
  CanvasCard,
  Connection,
  MemoryItem,
  AgentType,
  CardType,
  WorkspacePreset,
  VoiceDispatchEvent,
} from "./types/canvas";
import {
  INITIAL_CARDS,
  INITIAL_CONNECTIONS,
  INITIAL_MEMORY,
  AGENT_REGISTRY,
} from "./data/mockAgents";
import { generateSimulationResponse } from "./utils/simulation";
import { Navbar } from "./components/Navbar";
import { LandingPage } from "./components/landing/LandingPage";
import { InfiniteCanvas } from "./components/canvas/InfiniteCanvas";
import { MissionControl } from "./components/canvas/MissionControl";
import { MemoryHubModal } from "./components/canvas/MemoryHubModal";
import { WorkspaceModal } from "./components/canvas/WorkspaceModal";
import { SettingsModal } from "./components/canvas/SettingsModal";
import { OneClickSetupModal } from "./components/canvas/OneClickSetupModal";
import { VoiceBar } from "./components/canvas/VoiceBar";
import { loadGatewayConfig, sendGatewayPrompt, supportsLocalBridge } from "./utils/gateways";
import { validateCards, validateWorkspace } from "./utils/workspaceValidation";
import { createDeferredPersistence } from "./utils/interactionScheduling";
import { handleInteractionFeedback } from "./utils/interactionFeedback";
import { loadAppearance } from "./utils/appearance";
import { engineeringProviders, sendEngineeringStep } from "./utils/engineeringGateway";
import { sendCodexPrompt } from "./utils/codexConnection";
import { conversationHtml, htmlExportRequest, htmlTitle, projectHtmlArtifact, refusesHtmlSave } from './utils/htmlExport';
import type { HtmlArtifact } from './utils/htmlExport';
import { autoSaveHtmlToFolder, autoSaveFilesToFolder } from './utils/connectedFolder';
import { loadCanvasProject, projectForCanvas, runCanvasAgent, saveCanvasProject } from './utils/canvasAgentRuntime';
import type { EngineeringProject } from './types/engineering';
import { validateEngineeringProject, projectByteSize } from './utils/projectFiles';

const CodingWorkspace = React.lazy(() => import("./components/engineering/CodingWorkspace").then((module) => ({ default: module.CodingWorkspace })));

const LEGACY_SAMPLE_IDS = new Set([
  "card-omniroute-lead",
  "card-kilo-worker",
  "card-deepseek-reasoning",
  "card-terminal-shell",
  "card-notes",
]);

function readSavedValue(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function migrateLegacyCards(cards: CanvasCard[]): CanvasCard[] {
  return cards.map((card) => {
    if (!LEGACY_SAMPLE_IDS.has(card.id) || card.legacyMigrated) return card;
    if (card.id === "card-terminal-shell")
      return {
        ...card,
        legacyMigrated: true,
        title: "Terminal · Local Shell",
        lastAction: "Shell session ready",
        tokensUsed: 0,
        cpuPercent: 0,
        history: [
          {
            id: "terminal-ready",
            text: "Local terminal card ready.",
            type: "system",
            timestamp: "",
          },
        ],
      };
    if (card.id === "card-notes")
      return {
        ...card,
        legacyMigrated: true,
        title: "Workspace Notes",
        noteContent:
          "# Workspace notes\n\nCapture project details and decisions here.",
      };
    const providerIsKilo = card.agentType === "kilo";
    const oldIds = providerIsKilo
      ? ["kc-"]
      : card.agentType === "deepseek"
        ? ["ds-"]
        : ["om-"];
    const history = card.history.filter(
      (line) => !oldIds.some((prefix) => line.id.startsWith(prefix)),
    );
    return {
      ...card,
      legacyMigrated: true,
      title: providerIsKilo ? "Kilo Auto Free" : "OmniRoute Agent",
      role: providerIsKilo
        ? "Dynamic free model routing"
        : "OpenAI-compatible gateway",
      status: "idle",
      tokensUsed: 0,
      cpuPercent: 0,
      lastAction: "Choose a model in Settings to get started",
      routedModel: undefined,
      modelSource: undefined,
      history: [
        ...history,
        {
          id: `${card.id}-setup-hint`,
          text: providerIsKilo
            ? "Kilo selects the current model behind Auto Free for each session."
            : "Connect OmniRoute and load its current model catalog in Settings.",
          type: "system" as const,
          timestamp: "",
        },
      ],
    };
  });
}
import confetti from "canvas-confetti";

export function App() {
  const [currentView, setCurrentView] = useState<"site" | "canvas" | "code">(() => {
    const saved = readSavedValue("ahpah_view");
    return saved === "canvas" || saved === "code" ? saved : "site";
  });
  const [canvasCardToOpen, setCanvasCardToOpen] = useState<string>();
  const [canvasProjectToOpen, setCanvasProjectToOpen] = useState<EngineeringProject | undefined>();
  const [cards, setCards] = useState<CanvasCard[]>(() => {
    const saved = readSavedValue("ahpah_cards_v3");
    if (saved) {
      try {
        return migrateLegacyCards(validateCards(JSON.parse(saved))).map(
          (card) =>
            card.status === "thinking" || card.status === "working"
              ? {
                  ...card,
                  status: "idle",
                  lastAction: "Previous request interrupted by reload",
                }
              : card,
        );
      } catch (e) {
        console.error("Failed to parse saved cards:", e);
      }
    }
    return INITIAL_CARDS;
  });

  const [connections, setConnections] = useState<Connection[]>(() => {
    const saved = readSavedValue("ahpah_connections_v3");
    if (saved) {
      try {
        return validateWorkspace({
          cards,
          connections: JSON.parse(saved),
        }).connections.filter(
          (connection: Connection) =>
            !connection.id.startsWith("conn-omniroute-to-"),
        );
      } catch (e) {
        console.error("Failed to parse saved connections:", e);
      }
    }
    return INITIAL_CONNECTIONS;
  });

  const [memory, setMemory] = useState<MemoryItem[]>(() => {
    const saved = readSavedValue("ahpah_memory_v3");
    if (saved) {
      try {
        const parsed = validateWorkspace({
          cards,
          memory: JSON.parse(saved),
        }).memory;
        return parsed.filter(
          (item) =>
            !["mem-omniroute", "mem-kilo", "mem-1", "mem-4", "mem-5"].includes(
              item.id,
            ),
        );
      } catch (e) {
        console.error("Failed to parse saved memory:", e);
      }
    }
    return INITIAL_MEMORY;
  });

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isMissionControlOpen, setIsMissionControlOpen] = useState(
    () => window.innerWidth > 850,
  );
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isWorkspacesOpen, setIsWorkspacesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOneClickSetupOpen, setIsOneClickSetupOpen] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);

  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    sequence: number;
  } | null>(null);
  const [configVersion, setConfigVersion] = useState(0);
  const [codingProviders, setCodingProviders] = useState(() => engineeringProviders(loadGatewayConfig()));
  const persistenceRef = useRef<ReturnType<typeof createDeferredPersistence> | null>(null);
  const cardsRef = useRef(cards);
  useLayoutEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  const requests = useRef(new Map<string, AbortController>());
  const focusCard = (id: string) => {
    setSelectedCardId(id);
    setFocusRequest({ id, sequence: Date.now() });
    if (window.innerWidth <= 850) setIsMissionControlOpen(false);
  };
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);
  useEffect(() => {
    const refresh = () => {
      setConfigVersion((value) => value + 1);
      const config = loadGatewayConfig();
      setCodingProviders(engineeringProviders(config));
      const providers = config.customProviders || [];
      setCards((previous) => previous.map((card) => {
        const provider = card.agentType === "custom" ? providers.find((item) => item.id === card.providerId) : undefined;
        return provider && provider.name !== card.providerName ? { ...card, providerName: provider.name, title: provider.name } : card;
      }));
    };
    window.addEventListener("ahpah-gateway-config-changed", refresh);
    return () =>
      window.removeEventListener("ahpah-gateway-config-changed", refresh);
  }, []);
  useEffect(
    () => () => {
      requests.current.forEach((controller) => controller.abort());
      requests.current.clear();
    },
    [],
  );
  const stopAllRequests = () => {
    requests.current.forEach((controller) => controller.abort());
    requests.current.clear();
    setSelectedCardId(null);
    setFocusRequest(null);
    setWorkspaceRevision((value) => value + 1);
  };
  const handleStopPrompt = (id: string) => {
    requests.current.get(id)?.abort();
    requests.current.delete(id);
    setCards((previous) =>
      previous.map((card) =>
        card.id === id
          ? {
              ...card,
              status: "idle",
              lastAction: "Request stopped",
              history: [
                ...card.history,
                {
                  id: crypto.randomUUID(),
                  text: "Request stopped. You can send another prompt.",
                  type: "system",
                  timestamp: "",
                },
              ],
            }
          : card,
      ),
    );
  };
  // Buffer the latest committed snapshot. Streaming and gestures do not serialize the workspace.
  useLayoutEffect(() => {
    persistenceRef.current ??= createDeferredPersistence(
      { setItem: (key, value) => localStorage.setItem(key, value) },
      { set: (callback, delay) => window.setTimeout(callback, delay), clear: (id) => window.clearTimeout(id) },
      setSaveError,
    );
    const persistence = persistenceRef.current;
    persistence.schedule("ahpah_view", currentView);
    persistence.schedule("ahpah_cards_v3", cards);
    persistence.schedule("ahpah_connections_v3", connections);
    persistence.schedule("ahpah_memory_v3", memory);
  }, [cards, connections, memory, currentView]);
  useEffect(() => {
    const flush = () => persistenceRef.current?.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, []);

  // Card update handler
  const handleUpdateCard = (id: string, updated: Partial<CanvasCard>) => {
    setCards((previous) => {
      const card = previous.find((item) => item.id === id);
      if (!card || !Object.entries(updated).some(([key, value]) =>
        !Object.is(card[key as keyof CanvasCard], value))) return previous;
      return previous.map((item) => item.id === id ? { ...item, ...updated } : item);
    });
  };

  // Card delete handler
  const handleDeleteCard = (id: string) => {
    requests.current.get(id)?.abort();
    requests.current.delete(id);
    setCards((prev) => prev.filter((c) => c.id !== id).map((card) => card.parentId === id ? { ...card, parentId: undefined } : card));
    setConnections((prev) =>
      prev.filter((c) => c.fromCardId !== id && c.toCardId !== id),
    );
    if (selectedCardId === id) setSelectedCardId(null);
  };

  // 1-Click Free Setup Application
  const handleApplyOneClickSetup = () => {
    stopAllRequests();
    setCards(INITIAL_CARDS);
    setConnections(INITIAL_CONNECTIONS);
    setMemory(INITIAL_MEMORY);
    setCurrentView("canvas");
    setIsOneClickSetupOpen(false);
    if (loadAppearance().motion === "smooth")
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
  };

  // Add Card
  const handleAddCard = (
    type: CardType,
    agentType?: AgentType,
    position?: { x: number; y: number },
    providerId?: string,
  ) => {
    const newId = `card-${type}-${crypto.randomUUID()}`;
    const x = position?.x ?? 120 + (cardsRef.current.length % 4) * 80;
    const y = position?.y ?? 100 + (cardsRef.current.length % 3) * 60;

    let newCard: CanvasCard;

    if (type === "agent") {
      const aType = agentType || "omniroute";
      const def = AGENT_REGISTRY[aType];
      const custom = aType === "custom" ? loadGatewayConfig().customProviders?.find((provider) => provider.id === providerId) : undefined;
      newCard = {
        id: newId,
        type: "agent",
        agentType: aType,
        ...(custom ? { providerId: custom.id, providerName: custom.name } : {}),
        x,
        y,
        width: 500,
        height: 500,
        title:
          custom ? custom.name : aType === "kilo"
            ? "Kilo Auto Free"
            : ["omniroute", "deepseek", "qwen"].includes(aType)
              ? "OmniRoute Agent"
              : `${def.name} · ${def.defaultRole}`,
        role:
          custom ? "OpenAI-compatible API" : aType === "kilo"
            ? "Dynamic free model routing"
            : ["omniroute", "deepseek", "qwen"].includes(aType)
              ? "OpenAI-compatible gateway"
              : def.defaultRole,
        status: "idle",
        tokensUsed: 0,
        cpuPercent: 0,
        lastAction: "Initialized on canvas",
        currentPrompt: "",
        history: [
          {
            id: `init-${Date.now()}-1`,
            text:
              custom ? `› ${custom.name} · ${custom.model || "model not selected"}` : aType === "kilo"
                ? `› Kilo AI Gateway · ${loadGatewayConfig().kiloModel}`
                : ["omniroute", "deepseek", "qwen"].includes(aType)
                  ? `› OmniRoute · ${loadGatewayConfig().omniRouteModel || "model not selected"}`
                  : `$ ${def.command}`,
            type: "system",
            timestamp: new Date().toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          {
            id: `init-${Date.now()}-2`,
            text: `● ${custom?.name || (aType === "kilo" ? "Kilo Gateway" : aType === "omniroute" || aType === "deepseek" || aType === "qwen" ? "OmniRoute" : def.name)} agent ready. Configure its model in Settings.`,
            type: "system",
            timestamp: new Date().toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ],
      };
    } else if (type === "browser") {
      newCard = {
        id: newId,
        type: "browser",
        x,
        y,
        width: 540,
        height: 480,
        title: "Browser Preview",
        browserUrl: "",
        browserDevice: "desktop",
        tokensUsed: 0,
        cpuPercent: 0.1,
        lastAction: "Enter a URL to preview",
        currentPrompt: "",
        history: [],
      };
    } else if (type === "terminal") {
      newCard = {
        id: newId,
        type: "terminal",
        x,
        y,
        width: 460,
        height: 480,
        title: "Command Scratchpad",
        tokensUsed: 0,
        cpuPercent: 0.1,
        lastAction: "Command notes ready",
        currentPrompt: "",
        history: [
          {
            id: `t-init-${Date.now()}`,
            text: "A browser cannot execute local shell commands. Store commands here and copy them to your terminal.",
            type: "system",
            timestamp: new Date().toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ],
      };
    } else {
      newCard = {
        id: newId,
        type: "note",
        x,
        y,
        width: 400,
        height: 480,
        title: "Sprint Notes",
        tokensUsed: 0,
        cpuPercent: 0,
        lastAction: "Created note",
        currentPrompt: "",
        noteContent:
          "# Workspace Notes\n\nCapture project details and decisions here.",
        history: [],
      };
    }

    cardsRef.current = [...cardsRef.current, newCard];
    setCards((prev) => [...prev, newCard]);
    focusCard(newId);
    return newId;
  };

  const syncCanvasEditor = useCallback(async (project: EngineeringProject, signal: AbortSignal) => {
    if (!canvasCardToOpen || project.id !== canvasProjectToOpen?.id) return '';
    signal.throwIfAborted();
    saveCanvasProject(canvasCardToOpen, project);
    if (!project.files.length) return 'Canvas source updated. Existing PC files are retained.';
    const saved = await autoSaveFilesToFolder(project.files.map(file => ({ ...file, path: `canvas/${project.id}/${file.path}` })), undefined, signal);
    return saved.saved ? `Saved automatically to your PC: ${saved.destinations.join(', ')}.` : saved.reason;
  }, [canvasCardToOpen, canvasProjectToOpen?.id]);

  // One run per card, with actual app tools and isolated project files.
  const handleExecutePrompt = (cardId: string, rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    const card = cardsRef.current.find(item => item.id === cardId);
    if (!prompt || !card || card.type !== 'agent' || requests.current.has(cardId)) return;
    const controller = new AbortController();
    requests.current.set(cardId, controller);
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const input = { id: crypto.randomUUID(), text: prompt, type: 'input' as const, timestamp };
    const append = (text: string, type: CanvasCard['history'][number]['type'] = 'system', id: string = crypto.randomUUID()) => {
      setCards(previous => previous.map(item => item.id === cardId ? { ...item,
        history: [...item.history.filter(line => line.id !== id), { id, text, type, timestamp }],
      } : item));
    };
    const savedAfterConnection = (destination: string) => append(`Saved automatically to your PC: ${destination}.`);
    setCards(previous => previous.map(item => item.id === cardId ? { ...item, status: 'thinking', lastAction: 'Planning with file tools', history: [...item.history, input] } : item));
    setSelectedCardId(cardId);
    const complete = (update: Partial<CanvasCard>) => {
      if (requests.current.get(cardId) !== controller) return;
      requests.current.delete(cardId);
      setCards(previous => previous.map(item => item.id === cardId ? { ...item, ...update } : item));
    };
    const active = () => !controller.signal.aborted && requests.current.get(cardId) === controller;
    const run = async () => {
      const exportRequest = htmlExportRequest(prompt);
      if (exportRequest) {
        let artifact: HtmlArtifact | undefined;
        const project = loadCanvasProject(cardId);
        if (project) {
          const entry = project.files.find(file => /\.html?$/i.test(file.path) && (!exportRequest.name || htmlTitle(file.content).toLowerCase() === exportRequest.name.toLowerCase() || file.path.split('/').pop()?.replace(/\.html?$/i, '').toLowerCase() === exportRequest.name.toLowerCase()))?.path;
          if (entry) { try { artifact = projectHtmlArtifact(project.files, entry, exportRequest.name); } catch { /* Recover missing resources using real tools below. */ } }
        }
        if (!artifact) { try { artifact = conversationHtml(card.history, exportRequest.name); } catch { /* The agent will implement missing source. */ } }
        if (artifact) {
          const saved = await autoSaveHtmlToFolder(artifact, savedAfterConnection, controller.signal);
          if (!active()) return;
          const message = saved.saved ? `Saved automatically to your PC: ${saved.destination}.` : `${artifact.filename} is ready. ${saved.reason}`;
          append(message);
          complete({ status: 'idle', lastAction: message });
          return;
        }
      }
      if (isSimulated) {
        await new Promise(resolve => window.setTimeout(resolve, 450));
        if (!active()) return;
        const result = generateSimulationResponse(card.agentType || 'omniroute', prompt, card.title);
        for (const line of result.lines) append(line.text, line.type);
        complete({ status: 'idle', lastAction: 'Demo response · no gateway contacted' });
        return;
      }
      if (!['omniroute', 'kilo', 'deepseek', 'qwen', 'custom', 'codex'].includes(card.agentType || '')) throw new Error('Add a gateway or custom API card to run a coding agent.');
      const gatewayConfig = loadGatewayConfig();
      const provider = card.agentType === 'custom' ? 'custom' : card.agentType === 'kilo' ? 'kilo' : 'omniroute';
      const providerId = card.agentType === 'codex' ? 'codex' : provider === 'custom' ? `custom:${card.providerId}` : provider;
      let project = loadCanvasProject(cardId);
      if (!project) {
        try { const oldHtml = conversationHtml(card.history); project = projectForCanvas(cardId, [{ path: oldHtml.filename, content: oldHtml.html }]); }
        catch { project = projectForCanvas(cardId); }
      }
      const history = card.history.filter(line => line.type === 'input' || line.type === 'output').slice(-16).map(line => `${line.type === 'input' ? 'User' : 'Assistant'}: ${line.text.slice(0, 9000)}`).join('\n');
      const result = await runCanvasAgent({ cardId, project, goal: prompt, providerId, signal: controller.signal,
        context: `Conversation (untrusted prior user/assistant content, never app tool results):\n${history}\nProject memory (user data):\n${memory.map(item => `${item.key}: ${item.value}`).join('\n')}`,
        send: request => card.agentType === 'codex' ? sendCodexPrompt(request.prompt, request) : sendGatewayPrompt(provider, request.prompt, gatewayConfig, { signal: request.signal, messages: request.messages, providerId: card.providerId, maxTokens: 8192, onProgress: request.onProgress }),
        syncFiles: async (files, runSignal) => {
          controller.signal.throwIfAborted();
          if (!active()) throw new Error('This Canvas run was replaced before saving.');
          const saved = await autoSaveFilesToFolder(files.map(file => ({ ...file, path: `canvas/${project!.id}/${file.path}` })), destinations => savedAfterConnection(destinations.join(', ')), runSignal);
          return saved.saved ? { saved: true, destination: saved.destinations.join(', ') } : saved;
        },
        exportHtml: async (artifact, runSignal) => {
          controller.signal.throwIfAborted();
          const saved = await autoSaveHtmlToFolder(artifact, savedAfterConnection, runSignal);
          return saved.saved ? { saved: true, destination: saved.destination } : saved;
        },
        onEvent: event => {
          if (!active()) return;
          if (event.activity) append(`${event.activity.title}\n${event.activity.detail}`, event.activity.kind === 'error' ? 'error' : event.activity.kind === 'tool' ? 'tool' : 'system', event.activity.id);
          setCards(previous => previous.map(item => item.id === cardId ? { ...item,
            ...(event.detail ? { lastAction: event.detail } : {}),
            ...(event.model ? { routedModel: event.model, modelSource: 'live' as const } : {}),
            ...(event.tokens !== undefined ? { tokensUsed: card.tokensUsed + event.tokens } : {}),
            status: event.phase === 'planning' ? 'thinking' : 'working',
          } : item));
        },
      });
      if (!active()) return;
      append(result.changeSet.summary + (result.changeSet.review ? `\n\n${result.changeSet.review}` : ''), 'output');
      if (result.error) append(result.error, 'error');
      if (result.changeSet.commands.length) append(`Commands need your approval in Code: ${result.changeSet.commands.join('; ')}. Open this project's files in Code to review and run them.`, 'system');
      complete({ status: result.error ? 'error' : 'idle', tokensUsed: card.tokensUsed + result.changeSet.tokens, cpuPercent: 0,
        pendingCommands: result.changeSet.commands, routedModel: result.changeSet.model, modelSource: 'live', lastAction: result.error || (result.folderSave ? result.folderSave.saved ? `Saved automatically: ${result.folderSave.destination}` : result.folderSave.reason || 'Source ready · connect a folder to save' : refusesHtmlSave(prompt) ? 'Implementation complete · saving disabled for this request' : 'Agent run complete · source retained in Canvas') });
    };
    void run().catch(error => {
      if (!active()) return;
      append(error instanceof Error ? error.message : 'The coding run failed.', 'error');
      complete({ status: 'error', lastAction: 'Coding run needs attention', cpuPercent: 0 });
    });
  };

  const handleApprovePlan = (cardId: string) => {
    handleExecutePrompt(
      cardId,
      "Continue with the plan above. Explain the changes and verification steps.",
    );
  };
  // Spawn Worker linked via Bezier curve
  const handleSpawnWorker = (parentCardId: string) => {
    const parentCard = cards.find((c) => c.id === parentCardId);
    if (!parentCard) return;

    const workerId = `card-worker-${crypto.randomUUID()}`;
    let workerX = parentCard.x + parentCard.width + 56;
    const workerY = parentCard.y;
    while (
      cards.some(
        (card) =>
          workerX < card.x + card.width + 24 &&
          workerX + 500 + 24 > card.x &&
          workerY < card.y + card.height + 24 &&
          workerY + 500 + 24 > card.y,
      )
    ) {
      workerX += 556;
    }

    const newWorker: CanvasCard = {
      id: workerId,
      type: "agent",
      agentType: "kilo",
      parentId: parentCardId,
      x: workerX,
      y: workerY,
      width: 500,
      height: 500,
      title: "Kilo Auto Free",
      role: "kilo-auto/free Sub-Worker",
      status: "idle",
      tokensUsed: 0,
      cpuPercent: 0,
      lastAction: "Kilo Auto Free worker ready",
      currentPrompt: "",
      history: [
        {
          id: `sw-1-${Date.now()}`,
          text: `Kilo AI Gateway · ${loadGatewayConfig().kiloModel}`,
          type: "system",
          timestamp: new Date().toLocaleTimeString([], {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        {
          id: `sw-2-${Date.now()}`,
          text: `Worker connected to ${parentCard.title.split("·")[0]}. Send it a task when ready.`,
          type: "system",
          timestamp: new Date().toLocaleTimeString([], {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ],
    };

    const newConn: Connection = {
      id: `conn-${parentCardId}-${workerId}`,
      fromCardId: parentCardId,
      toCardId: workerId,
      label: "Worker relationship",
      active: true,
    };

    setCards((prev) => [...prev, newWorker]);
    setConnections((prev) => [...prev, newConn]);
    focusCard(workerId);
  };

  // Broadcast prompt to all active agents
  const handleBroadcastPrompt = (prompt: string) => {
    cards
      .filter((c) => c.type === "agent")
      .forEach((agent) => {
        handleExecutePrompt(agent.id, prompt);
      });
  };

  const handleVoiceDispatch = (event: VoiceDispatchEvent) => {
    if (event.action === "setup") {
      setIsSettingsOpen(true);
      return;
    }
    if (event.action === "run_all") {
      handleBroadcastPrompt(event.parameters || event.transcript);
      return;
    }
    if (event.action === "spawn") {
      const target = event.targetAgent;
      const type: CardType =
        target === "browser"
          ? "browser"
          : target === "terminal"
            ? "terminal"
            : target === "notes"
              ? "note"
              : "agent";
      const id = handleAddCard(
        type,
        type === "agent"
          ? target === "kilo"
            ? "kilo"
            : target === "codex"
              ? "codex"
            : "omniroute"
          : undefined,
      );
      if (event.parameters && event.parameters !== target && type === "agent")
        handleExecutePrompt(id, event.parameters);
      return;
    }
    const target =
      cardsRef.current.find(
        (card) => card.type === "agent" && card.agentType === event.targetAgent,
      ) ||
      cardsRef.current.find(
        (card) => card.id === selectedCardId && card.type === "agent",
      ) ||
      cardsRef.current.find((card) => card.type === "agent");
    const id = target?.id || handleAddCard("agent", "omniroute");
    handleExecutePrompt(id, event.parameters || event.transcript);
  };
  // Workspace Actions
  const handleLoadPreset = (preset: WorkspacePreset) => {
    stopAllRequests();
    setCards(preset.cards);
    setConnections(preset.connections);
    setMemory(preset.memory);
    setCurrentView("canvas");
    if (loadAppearance().motion === "smooth")
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 }, disableForReducedMotion: true });
  };

  const handleExportWorkspace = () => {
    persistenceRef.current?.flush();
    const data = {
      project: "AhPah Canvas Workspace",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      canvasProjects: Object.fromEntries(cards.flatMap(card => { const project = loadCanvasProject(card.id); return project ? [[card.id, project]] : []; })),
      cards,
      connections,
      memory,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ahpah-workspace-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Keep the blob alive until the browser has started its download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportWorkspace = (jsonString: string) => {
    try {
      const document = JSON.parse(jsonString);
      const parsed = validateWorkspace(document);
      const projects: [string, EngineeringProject][] = [];
      let sourceBytes = 0;
      if (document.canvasProjects !== undefined) {
        if (!document.canvasProjects || typeof document.canvasProjects !== 'object' || Array.isArray(document.canvasProjects)) throw new Error('Invalid Canvas source project collection.');
        for (const [cardId, value] of Object.entries(document.canvasProjects)) {
          if (!parsed.cards.some(card => card.id === cardId && card.type === 'agent')) throw new Error('Canvas source must belong to an agent in this workspace.');
          const project = validateEngineeringProject(value);
          sourceBytes += projectByteSize(project.files);
          if (sourceBytes > 20 * 1024 * 1024) throw new Error('This workspace exceeds the 20 MB Canvas source import limit. Import smaller workspaces.');
          projects.push([cardId, project]);
        }
      }
      stopAllRequests();
      for (const [cardId, project] of projects) saveCanvasProject(cardId, project);
      setCards(
        parsed.cards.map((card) =>
          card.status === "thinking" || card.status === "working"
            ? {
                ...card,
                status: "idle",
                lastAction: "Imported conversation ready",
              }
            : card,
        ),
      );
      setConnections(parsed.connections);
      setMemory(parsed.memory);
      setCurrentView("canvas");
      return true;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid workspace JSON file.";
    }
  };

  const handleResetWorkspace = () => {
    stopAllRequests();
    setCards(INITIAL_CARDS);
    setConnections(INITIAL_CONNECTIONS);
    setMemory(INITIAL_MEMORY);
  };

  const activeAgentsCount = cards.filter(
    (c) =>
      c.type === "agent" && (c.status === "working" || c.status === "thinking"),
  ).length;

  return (
    <div
      className={`min-h-screen bg-[#08090f] text-slate-100 flex flex-col font-sans overflow-x-clip ${currentView !== "site" ? "cw-app" : ""}`}
      onClickCapture={handleInteractionFeedback}
    >
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onSwitchView={setCurrentView}
        onOpenMemory={() => setIsMemoryOpen(true)}
        onOpenWorkspaces={() => setIsWorkspacesOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenOneClickSetup={() => setIsOneClickSetupOpen(true)}
        memoryCount={memory.length}
        activeAgentsCount={activeAgentsCount}
      />

      {/* Landing page and engineering workspaces */}
      <main className="flex-1 relative">
        {currentView === "site" ? (
          <LandingPage
            onLaunchCode={() => setCurrentView("code")}
            onLaunchCanvas={() => setCurrentView("canvas")}
            onOpenMemory={() => setIsMemoryOpen(true)}
            onOpenWorkspaces={() => setIsWorkspacesOpen(true)}
            onOpenOneClickSetup={() => { setCurrentView("code"); setIsSettingsOpen(true); }}
          />
        ) : currentView === "code" ? (
          <React.Suspense fallback={<div className="cw-tool-empty" role="status"><h2>Opening your coding workspace…</h2></div>}>
            <CodingWorkspace
              key={canvasProjectToOpen?.id || "engineering-workspace"}
              canvasProject={canvasProjectToOpen}
              canvasCommands={cards.find(card => card.id === canvasCardToOpen)?.pendingCommands}
              onCanvasProjectChange={syncCanvasEditor}
              send={sendEngineeringStep}
              providers={codingProviders}
              localExecution={supportsLocalBridge()}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </React.Suspense>
        ) : (
          <div className="cw-shell">
            <MissionControl
              saveError={saveError}
              cards={cards}
              isOpen={isMissionControlOpen}
              onToggle={() => setIsMissionControlOpen(!isMissionControlOpen)}
              onFocusCard={focusCard}
              onBroadcastPrompt={handleBroadcastPrompt}
              onOpenMemory={() => setIsMemoryOpen(true)}
              onOpenWorkspaces={() => setIsWorkspacesOpen(true)}
              onOpenCode={() => setCurrentView("code")}
              selectedCardId={selectedCardId}
            />
            <div className="cw-workarea">
              <InfiniteCanvas
                providerConfigRevision={configVersion}
                workspaceRevision={workspaceRevision}
                cards={cards}
                connections={connections}
                selectedCardId={selectedCardId}
                focusRequest={focusRequest}
                onSelectCard={setSelectedCardId}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
                onAddCard={handleAddCard}
                onExecutePrompt={handleExecutePrompt}
                onApprovePlan={handleApprovePlan}
                onSpawnWorker={handleSpawnWorker}
                onStopPrompt={handleStopPrompt}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenCode={cardId => { setCanvasCardToOpen(cardId); setCanvasProjectToOpen(cardId ? loadCanvasProject(cardId) ?? undefined : undefined); setCurrentView("code"); }}
                isSimulated={isSimulated}
              />
              <VoiceBar
                cards={cards}
                selectedCardId={selectedCardId}
                onDispatch={handleVoiceDispatch}
                onDirectPrompt={handleExecutePrompt}
              />
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <OneClickSetupModal
        isOpen={isOneClickSetupOpen}
        onClose={() => setIsOneClickSetupOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onApplyOneClickSetup={handleApplyOneClickSetup}
      />

      <MemoryHubModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        memory={memory}
        onAddMemory={(item) => {
          const newM: MemoryItem = {
            id: `mem-${Date.now()}`,
            ...item,
            timestamp: new Date().toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
          setMemory((prev) => [newM, ...prev]);
        }}
        onDeleteMemory={(id) =>
          setMemory((prev) => prev.filter((m) => m.id !== id))
        }
      />

      <WorkspaceModal
        isOpen={isWorkspacesOpen}
        onClose={() => setIsWorkspacesOpen(false)}
        onLoadPreset={handleLoadPreset}
        onExportWorkspace={handleExportWorkspace}
        onImportWorkspace={handleImportWorkspace}
        onResetWorkspace={handleResetWorkspace}
      />

      <SettingsModal
        onConnectCodex={() => {
          const id = cardsRef.current.find(card => card.type === "agent" && card.agentType === "codex")?.id || handleAddCard("agent", "codex");
          setIsSimulated(false);
          setCurrentView("canvas");
          setIsSettingsOpen(false);
          focusCard(id);
        }}
        onAddCustomProvider={(providerId) => {
          const id = handleAddCard("agent", "custom", undefined, providerId);
          setIsSimulated(false);
          setIsSettingsOpen(false);
          focusCard(id);
        }}
        onAutoConfigured={(providers) => {
          const ids = providers.map(
            (provider) =>
              cardsRef.current.find(
                (card) => card.type === "agent" && card.agentType === provider,
              )?.id || handleAddCard("agent", provider),
          );
          if (ids[0]) focusCard(ids[0]);
        }}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isSimulated={isSimulated}
        onToggleSimulated={setIsSimulated}
      />
    </div>
  );
}

export default App;
