import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  memo,
} from "react";
import {
  Plus,
  Radio,
  Sparkles,
  FileText,
  Globe,
  Terminal,
  Code2,
  LayoutGrid,
  Grid2X2,
  Minus,
  Maximize2,
  MousePointer2,
  Move,
  ChevronDown,
  X,
  Focus,
} from "lucide-react";
import type {
  CanvasCard,
  Connection,
  AgentType,
  CardType,
} from "../../types/canvas";
import { AgentCard } from "./AgentCard";
import { BrowserPreviewCard } from "./BrowserPreviewCard";
import { TerminalCard } from "./TerminalCard";
import { NoteCard } from "./NoteCard";
import {
  arrangeCards,
  fitCamera,
  zoomCamera,
  type Camera,
} from "../../utils/canvasGeometry";
import { cardName } from "../../utils/cardPresentation";
import { loadGatewayConfig } from "../../utils/gateways";
import { createFrameQueue } from "../../utils/interactionScheduling";
import "./canvas.css";
import {
  loadAppearance,
  saveAppearance,
  type Appearance,
} from "../../utils/appearance";

interface InfiniteCanvasProps {
  providerConfigRevision: number;
  workspaceRevision: number;
  cards: CanvasCard[];
  connections: Connection[];
  selectedCardId: string | null;
  focusRequest: { id: string; sequence: number } | null;
  onSelectCard: (id: string | null) => void;
  onUpdateCard: (id: string, updated: Partial<CanvasCard>) => void;
  onDeleteCard: (id: string) => void;
  onAddCard: (
    type: CardType,
    agentType?: AgentType,
    position?: { x: number; y: number },
    providerId?: string,
  ) => void;
  onExecutePrompt: (cardId: string, prompt: string) => void;
  onApprovePlan: (cardId: string) => void;
  onSpawnWorker: (parentCardId: string) => void;
  onStopPrompt: (cardId: string) => void;
  onOpenSettings: () => void;
  onOpenCode: (cardId?: string) => void;
  isSimulated: boolean;
}

export function InfiniteCanvas(props: InfiniteCanvasProps) {
  const {
    cards,
    connections,
    selectedCardId,
    onSelectCard,
    onUpdateCard,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCameraState] = useState<Camera>({ x: 40, y: 80, scale: 0.85 });
  const cameraRef = useRef(camera);
  const propsRef = useRef(props);
  const cardsRef = useRef(cards);
  const selectedRef = useRef(selectedCardId);
  useLayoutEffect(() => {
    cardsRef.current = cards;
    selectedRef.current = selectedCardId;
    propsRef.current = props;
  });
  const applyCamera = useCallback((next: Camera) => {
    cameraRef.current = next;
    setCameraState(next);
  }, []);
  const framesRef = useRef<{
    camera: ReturnType<typeof createFrameQueue<Camera>>;
    card: ReturnType<typeof createFrameQueue<{ id: string; update: Partial<CanvasCard> }>>;
  } | null>(null);
  useLayoutEffect(() => {
    const scheduler = {
      request: (callback: () => void) => window.requestAnimationFrame(callback),
      cancel: (id: number) => window.cancelAnimationFrame(id),
    };
    const frames = {
      camera: createFrameQueue(applyCamera, scheduler),
      card: createFrameQueue<{ id: string; update: Partial<CanvasCard> }>(({ id, update }) => {
        propsRef.current.onUpdateCard(id, update);
      }, scheduler),
    };
    framesRef.current = frames;
    return () => {
      frames.camera.cancel();
      frames.card.cancel();
      framesRef.current = null;
    };
  }, [applyCamera]);
  const setCamera = useCallback((value: Camera | ((previous: Camera) => Camera)) => {
    framesRef.current?.camera.cancel();
    applyCamera(typeof value === "function" ? value(cameraRef.current) : value);
  }, [applyCamera]);
  const cardActions = useMemo(() => ({
    onSelectCard: (id: string | null) => propsRef.current.onSelectCard(id),
    onUpdateCard: (id: string, update: Partial<CanvasCard>) => propsRef.current.onUpdateCard(id, update),
    onDeleteCard: (id: string) => propsRef.current.onDeleteCard(id),
    onExecutePrompt: (id: string, prompt: string) => propsRef.current.onExecutePrompt(id, prompt),
    onApprovePlan: (id: string) => propsRef.current.onApprovePlan(id),
    onSpawnWorker: (id: string) => propsRef.current.onSpawnWorker(id),
    onStopPrompt: (id: string) => propsRef.current.onStopPrompt(id),
    onOpenSettings: () => propsRef.current.onOpenSettings(),
    onOpenCode: (cardId?: string) => propsRef.current.onOpenCode(cardId),
  }), []);
  const [grid, setGrid] = useState(() => loadAppearance().grid !== "none");
  useEffect(() => {
    const update = (event: Event) =>
      setGrid((event as CustomEvent<Appearance>).detail.grid !== "none");
    window.addEventListener("ahpah-appearance-changed", update);
    return () => window.removeEventListener("ahpah-appearance-changed", update);
  }, []);
  const [handTool, setHandTool] = useState(false);
  const [moving, setMoving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    kind: "pan" | "drag" | "resize";
    id?: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
  } | null>(null);
  const dimensions = () => ({
    width: containerRef.current?.clientWidth || 1000,
    height: containerRef.current?.clientHeight || 700,
  });
  const fit = useCallback((items = cardsRef.current) => {
    const size = dimensions();
    setCamera(fitCamera(items, size.width, size.height));
  }, [setCamera]);
  const focus = useCallback(
    (id: string) => {
      const card = cardsRef.current.find((item) => item.id === id);
      if (card) fit([card]);
    },
    [fit],
  );
  const zoom = useCallback((factor: number) => {
    const size = dimensions();
    setCamera((current) =>
      zoomCamera(
        current,
        current.scale * factor,
        size.width / 2,
        (size.height - 80) / 2,
      ),
    );
  }, [setCamera]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const selected = cardsRef.current.find(
        (card) => card.id === selectedRef.current,
      );
      fit(
        element.clientWidth < 600
          ? selected
            ? [selected]
            : cardsRef.current.slice(0, 1)
          : cardsRef.current,
      );
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement;
      if (gesture.current) return;
      if (target.closest(".cw-card") && !event.ctrlKey && !event.metaKey)
        return;
      if (
        target.closest("button,input,textarea,select,.cw-toolbar,.cw-add-menu")
      )
        return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = cameraRef.current;
      const next = zoomCamera(
          current,
          current.scale * Math.exp(-event.deltaY * 0.0015),
          event.clientX - rect.left,
          event.clientY - rect.top,
      );
      cameraRef.current = next;
      framesRef.current?.camera.push(next);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
    };
  }, [fit]);
  useEffect(() => {
    const size = dimensions();
    fit(size.width < 600 ? cardsRef.current.slice(0, 1) : cardsRef.current);
  }, [props.workspaceRevision, fit]);
  useEffect(() => {
    if (props.focusRequest) focus(props.focusRequest.id);
  }, [props.focusRequest, focus]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setAddOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        )
      )
        return;
      if (event.key === "Escape") {
        setAddOpen(false);
        onSelectCard(null);
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fit();
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoom(1.15);
      }
      if (event.key === "-") {
        event.preventDefault();
        zoom(1 / 1.15);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [fit, zoom, onSelectCard]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Finish queued zooming before computing gesture coordinates.
    framesRef.current?.camera.flush();
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "button,input,textarea,select,a,iframe,.cw-toolbar,.cw-add-menu,.cw-minimap",
      )
    )
      return;
    if (event.button !== 0 && event.button !== 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const currentCamera = cameraRef.current;
    const worldX = (event.clientX - rect.left - currentCamera.x) / currentCamera.scale;
    const worldY = (event.clientY - rect.top - currentCamera.y) / currentCamera.scale;
    const cardElement = target.closest("[data-card-id]");
    const card = cards.find(
      (item) => item.id === cardElement?.getAttribute("data-card-id"),
    );
    if (card && target.closest(".cw-resize")) {
      gesture.current = {
        kind: "resize",
        id: card.id,
        startX: event.clientX,
        startY: event.clientY,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
      };
    } else if (
      card &&
      target.closest(".card-drag-handle") &&
      !handTool &&
      event.button !== 1
    ) {
      gesture.current = {
        kind: "drag",
        id: card.id,
        startX: worldX,
        startY: worldY,
        x: card.x,
        y: card.y,
      };
      onSelectCard(card.id);
    } else if (!card || handTool || event.button === 1) {
      gesture.current = {
        kind: "pan",
        startX: event.clientX,
        startY: event.clientY,
        x: currentCamera.x,
        y: currentCamera.y,
      };
      if (!card) onSelectCard(null);
    } else return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMoving(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const action = gesture.current;
    if (!action) return;
    const currentCamera = cameraRef.current;
    if (action.kind === "pan") {
      const next = {
        ...currentCamera,
        x: action.x + event.clientX - action.startX,
        y: action.y + event.clientY - action.startY,
      };
      cameraRef.current = next;
      framesRef.current?.camera.push(next);
    } else if (action.kind === "resize")
      framesRef.current?.card.push({ id: action.id!, update: {
        width: Math.max(
          360,
          Math.round(
            action.width! + (event.clientX - action.startX) / currentCamera.scale,
          ),
        ),
        height: Math.max(
          300,
          Math.round(
            action.height! + (event.clientY - action.startY) / currentCamera.scale,
          ),
        ),
      }});
    else {
      const rect = event.currentTarget.getBoundingClientRect();
      framesRef.current?.card.push({ id: action.id!, update: {
        x: Math.round(
          action.x +
            (event.clientX - rect.left - currentCamera.x) / currentCamera.scale -
            action.startX,
        ),
        y: Math.round(
          action.y +
            (event.clientY - rect.top - currentCamera.y) / currentCamera.scale -
            action.startY,
        ),
      }});
    }
  };
  const endGesture = () => {
    framesRef.current?.camera.flush();
    framesRef.current?.card.flush();
    gesture.current = null;
    setMoving(false);
  };
  const add = (type: CardType, agentType?: AgentType, providerId?: string) => {
    const size = dimensions();
    props.onAddCard(type, agentType, {
      x: Math.round((size.width / 2 - camera.x) / camera.scale - 240),
      y: Math.round(((size.height - 80) / 2 - camera.y) / camera.scale - 240),
    }, providerId);
    setAddOpen(false);
  };
  const arrange = () => {
    const arranged = arrangeCards(cards, dimensions().width > 900 ? 2 : 1);
    arranged.forEach((card) => onUpdateCard(card.id, { x: card.x, y: card.y }));
    fit(arranged);
  };
  const miniBounds = cards.length
    ? {
        left: Math.min(...cards.map((c) => c.x)),
        top: Math.min(...cards.map((c) => c.y)),
        right: Math.max(...cards.map((c) => c.x + c.width)),
        bottom: Math.max(...cards.map((c) => c.y + c.height)),
      }
    : { left: 0, top: 0, right: 1000, bottom: 1000 };
  const miniScale = Math.min(
    138 / (miniBounds.right - miniBounds.left + 100),
    76 / (miniBounds.bottom - miniBounds.top + 100),
  );

  return (
    <div
      ref={containerRef}
      className={`cw-canvas ${handTool ? "is-hand" : ""} ${moving ? "is-moving" : ""}`}
      data-testid="canvas-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
      style={
        grid
          ? {
              backgroundImage: "var(--cw-canvas-texture)",
              backgroundSize: `${24 * camera.scale}px ${24 * camera.scale}px`,
              backgroundPosition: `${camera.x}px ${camera.y}px`,
            }
          : undefined
      }
    >
      <div className="cw-stage-glow" aria-hidden="true" />
      <div className="cw-workspace-label">
        <span className="cw-dot" /> My workspace{" "}
        <span className="cw-workspace-badge">
          {props.isSimulated ? "Demo simulation" : "Live gateways"}
        </span>
      </div>
      <div className="cw-top-actions" ref={menuRef}>
        <button className="cw-soft-button" onClick={props.onOpenSettings}>
          <Radio size={13} /> Connections
        </button>
        <button
          className="cw-primary-button"
          aria-expanded={addOpen}
          onClick={() => setAddOpen(!addOpen)}
        >
          <Plus size={14} /> Add card <ChevronDown size={12} />
        </button>
        {addOpen && (
          <div className="cw-add-menu">
            <div className="cw-menu-heading">
              ADD TO YOUR WORKSPACE{" "}
              <button
                aria-label="Close add menu"
                onClick={() => setAddOpen(false)}
              >
                <X size={13} />
              </button>
            </div>
            <button onClick={() => add("agent", "omniroute")}>
              <span className="cw-icon-tile">
                <Radio size={17} />
              </span>
              <div>
                OmniRoute agent<small>Your gateway’s current models</small>
              </div>
              <Plus size={13} />
            </button>
            <button onClick={() => add("agent", "kilo")}>
              <span className="cw-icon-tile cyan">
                <Sparkles size={17} />
              </span>
              <div>
                Kilo Auto Free<small>Dynamic free model routing</small>
              </div>
              <Plus size={13} />
            </button>
            <button onClick={() => add("agent", "codex")}>
              <span className="cw-icon-tile">
                <Code2 size={17} />
              </span>
              <div>
                Codex agent<small>Use your ChatGPT subscription</small>
              </div>
              <Plus size={13} />
            </button>
            <div className="cw-menu-divider" />
            {(loadGatewayConfig().customProviders || []).map((provider) => (
              <button key={provider.id} onClick={() => add("agent", "custom", provider.id)}>
                <span className="cw-icon-tile"><Radio size={17} /></span>
                <div>{provider.name}<small>{provider.model || "Choose a model in Settings"}</small></div>
                <Plus size={13} />
              </button>
            ))}
            <button onClick={() => { setAddOpen(false); props.onOpenSettings(); }}>
              <span className="cw-icon-tile"><Plus size={17} /></span>
              <div>Custom API provider<small>Connect your own model endpoint</small></div>
              <ChevronDown size={13} />
            </button>
            <div className="cw-menu-divider" />
            <button onClick={() => add("note")}>
              <span className="cw-icon-tile amber">
                <FileText size={17} />
              </span>
              <div>
                Project notes<small>Ideas, decisions, and checklists</small>
              </div>
              <Plus size={13} />
            </button>
            <button onClick={() => add("browser")}>
              <span className="cw-icon-tile cyan">
                <Globe size={17} />
              </span>
              <div>
                Browser preview<small>A real embedded web page</small>
              </div>
              <Plus size={13} />
            </button>
            <button onClick={() => add("terminal")}>
              <span className="cw-icon-tile">
                <Terminal size={17} />
              </span>
              <div>
                Command scratchpad
                <small>Keep commands close to your work</small>
              </div>
              <Plus size={13} />
            </button>
          </div>
        )}
      </div>
      <div
        className="cw-world"
        style={{
          transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`,
        }}
      >
        <svg
          className="cw-connection-layer"
          width="1"
          height="1"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="cw-wire">
              <stop stopColor="#b291f5" />
              <stop offset="1" stopColor="#64cbd7" />
            </linearGradient>
          </defs>
          {connections.map((conn) => {
            const from = cards.find((card) => card.id === conn.fromCardId);
            const to = cards.find((card) => card.id === conn.toCardId);
            if (!from || !to) return null;
            const start = from.x + from.width,
              end = to.x,
              distance = Math.max(70, Math.abs(end - start) * 0.5);
            const path = `M ${start} ${from.y + 110} C ${start + distance} ${from.y + 110} ${end - distance} ${to.y + 110} ${end} ${to.y + 110}`;
            return (
              <g key={conn.id}>
                <path className="cw-wire-glow" d={path} />
                <path d={path} />
                {conn.active && <path className="cw-wire-flow" d={path} />}
                <circle cx={start} cy={from.y + 110} r="4" />
                <circle cx={end} cy={to.y + 110} r="4" />
              </g>
            );
          })}
        </svg>
        {cards.map((card) => (
          <CanvasCardNode
            key={card.id}
            card={card}
            isSelected={selectedCardId === card.id}
            actions={cardActions}
            isSimulated={props.isSimulated}
            providerConfigRevision={props.providerConfigRevision}
          />
        ))}
      </div>
      {!cards.length && (
        <div className="cw-empty-workspace">
          <LayersIcon />
          <h2>A little space for your next idea.</h2>
          <p>Add an agent, jot down a thought, or bring in a preview.</p>
          <button
            className="cw-primary-button"
            onClick={() => add("agent", "omniroute")}
          >
            <Plus size={15} /> Add your first agent
          </button>
        </div>
      )}
      <div className="cw-toolbar" aria-label="Canvas controls">
        <button
          aria-label="Select tool"
          aria-pressed={!handTool}
          onClick={() => setHandTool(false)}
        >
          <MousePointer2 size={15} />
        </button>
        <button
          aria-label="Pan tool"
          aria-pressed={handTool}
          onClick={() => setHandTool(true)}
        >
          <Move size={15} />
        </button>
        <i />
        <button aria-label="Arrange cards" onClick={arrange}>
          <LayoutGrid size={15} />
        </button>
        <button
          aria-label="Toggle canvas grid"
          aria-pressed={grid}
          onClick={() =>
            saveAppearance({
              ...loadAppearance(),
              grid: grid ? "none" : "dots",
            })
          }
        >
          <Grid2X2 size={15} />
        </button>
        <i />
        <button aria-label="Zoom out" onClick={() => zoom(1 / 1.15)}>
          <Minus size={15} />
        </button>
        <button
          className="cw-zoom-label"
          aria-label="Reset zoom to 100 percent"
          onClick={() => {
            const size = dimensions();
            setCamera((current) =>
              zoomCamera(current, 1, size.width / 2, size.height / 2),
            );
          }}
        >
          {Math.round(camera.scale * 100)}%
        </button>
        <button aria-label="Zoom in" onClick={() => zoom(1.15)}>
          <Plus size={15} />
        </button>
        <button
          aria-label="Fit all cards"
          title="Fit all cards (F)"
          onClick={() => fit()}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <div className="cw-minimap">
        <span>
          WORKSPACE MAP <Focus size={10} />
        </span>
        <div>
          {cards.map((card) => (
            <button
              key={card.id}
              aria-label={`Focus ${cardName(card)}`}
              className={selectedCardId === card.id ? "selected" : ""}
              style={{
                left: 8 + (card.x - miniBounds.left) * miniScale,
                top: 8 + (card.y - miniBounds.top) * miniScale,
                width: Math.max(8, card.width * miniScale),
                height: Math.max(6, card.height * miniScale),
              }}
              onClick={() => {
                onSelectCard(card.id);
                focus(card.id);
              }}
            />
          ))}
        </div>
      </div>
      <div className="cw-canvas-hint">
        Drag to move · Scroll to zoom · F to fit
      </div>
    </div>
  );
}
type CardActions = Pick<InfiniteCanvasProps,
  "onSelectCard" | "onUpdateCard" | "onDeleteCard" | "onExecutePrompt" |
  "onApprovePlan" | "onSpawnWorker" | "onStopPrompt" | "onOpenSettings" | "onOpenCode">;

// Camera transforms move the world without rerendering every conversation or embedded preview.
const CanvasCardNode = memo(function CanvasCardNode({ card, isSelected, actions, isSimulated, providerConfigRevision }: {
  card: CanvasCard;
  isSelected: boolean;
  actions: CardActions;
  isSimulated: boolean;
  providerConfigRevision: number;
}) {
  const onSelect = useCallback(() => actions.onSelectCard(card.id), [actions, card.id]);
  const onUpdate = useCallback((update: Partial<CanvasCard>) => actions.onUpdateCard(card.id, update), [actions, card.id]);
  const onDelete = useCallback(() => actions.onDeleteCard(card.id), [actions, card.id]);
  const common = { card, isSelected, onSelect, onUpdate, onDelete };
  return (
    <div
      className={`cw-card-position ${isSelected ? "is-selected" : ""}`}
      data-card-id={card.id}
      style={{ left: card.x, top: card.y, zIndex: isSelected ? 5 : 1 }}
    >
      {card.type === "agent" && <AgentCard {...common}
        onExecutePrompt={actions.onExecutePrompt}
        onApprovePlan={actions.onApprovePlan}
        onSpawnWorker={actions.onSpawnWorker}
        onStopPrompt={actions.onStopPrompt}
        onOpenSettings={actions.onOpenSettings}
        onOpenCode={actions.onOpenCode}
        isSimulated={isSimulated}
        providerConfigRevision={providerConfigRevision}
      />}
      {card.type === "note" && <NoteCard {...common} />}
      {card.type === "browser" && <BrowserPreviewCard {...common} />}
      {card.type === "terminal" && <TerminalCard {...common} />}
      <div className="cw-resize" title="Drag to resize card" data-testid={`resize-${card.id}`} />
    </div>
  );
});

function LayersIcon() {
  return (
    <span className="cw-empty-icon">
      <LayoutGrid size={28} />
    </span>
  );
}
