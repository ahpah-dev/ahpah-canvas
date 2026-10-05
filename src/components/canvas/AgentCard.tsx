import React, { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  Radio,
  Sparkles,
  Bot,
  Copy,
  Check,
  X,
  Maximize2,
  Minimize2,
  ArrowUp,
  Square,
  GitBranch,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
  FileCode2,
  Settings2,
} from "lucide-react";
import type { CanvasCard, TerminalLine } from "../../types/canvas";
import { loadGatewayConfig, supportsLocalBridge } from "../../utils/gateways";
import { cardName, isBusy, statusName } from "../../utils/cardPresentation";
import { hasSameCardContent } from "../../utils/cardRendering";
import { isNearScrollBottom } from "../../utils/interactionScheduling";

interface AgentCardProps {
  card: CanvasCard;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<CanvasCard>) => void;
  onDelete: () => void;
  onExecutePrompt: (cardId: string, prompt: string) => void;
  onApprovePlan: (cardId: string) => void;
  onSpawnWorker?: (parentCardId: string) => void;
  onStopPrompt: (cardId: string) => void;
  onOpenSettings: () => void;
  isSimulated: boolean;
  providerConfigRevision: number;
}

function CodeBlock({ text, language }: { text: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="cw-response-code">
      <header>
        <FileCode2 size={12} />
        <span>{language || "Code"}</span>
        <button aria-label="Copy code" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </header>
      <pre>
        <code>{text.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}
function InlineText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((piece, index) =>
    piece.startsWith("**") ? <strong key={index}>{piece.slice(2, -2)}</strong>
      : piece.startsWith("`") ? <code key={index}>{piece.slice(1, -1)}</code> : piece);
}
const ResponseContent = memo(function ResponseContent({ text }: { text: string }) {
  return (
    <div className="cw-response-text">
      {text.split(/```/).map((part, index) =>
        index % 2 ? (
          <CodeBlock
            key={index}
            language={part.split("\n")[0].trim()}
            text={part.slice(part.indexOf("\n") + 1)}
          />
        ) : (
          part.split("\n").map((line, lineIndex) => {
            if (/^#{1,4}\s/.test(line))
              return <h4 key={lineIndex}><InlineText text={line.replace(/^#+\s/, "")} /></h4>;
            if (/^[-*]\s/.test(line))
              return (
                <div className="cw-response-bullet" key={lineIndex}>
                  <span>•</span>
                  <span><InlineText text={line.slice(2)} /></span>
                </div>
              );
            return line ? (
              <p key={lineIndex}>
                <InlineText text={line} />
              </p>
            ) : (
              <div className="cw-response-space" key={lineIndex} />
            );
          })
        ),
      )}
    </div>
  );
});

function AgentCardBody({
  card,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onExecutePrompt,
  onApprovePlan,
  onSpawnWorker,
  onStopPrompt,
  onOpenSettings,
  isSimulated,
  providerConfigRevision,
}: AgentCardProps) {
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const followingOutput = useRef(true);
  const oldSize = useRef<{ width: number; height: number } | null>(null);
  const busy = isBusy(card);
  const requestId = card.history.findLast((line) => line.type === "input")?.id;
  const [clock, setClock] = useState({ requestId: "", seconds: 0 });
  const elapsed = clock.requestId === requestId ? clock.seconds : 0;
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setClock({
      requestId: requestId || "",
      seconds: Math.floor((Date.now() - started) / 1000),
    }), 1000);
    return () => window.clearInterval(timer);
  }, [busy, requestId]);
  const kilo = card.agentType === "kilo";
  // The external provider snapshot is invalidated by App's configuration event revision.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const config = useMemo(() => loadGatewayConfig(), [providerConfigRevision]);
  const custom = card.agentType === "custom" ? config.customProviders?.find((provider) => provider.id === card.providerId) : undefined;
  const name = custom?.name || cardName(card);
  const providerName = custom?.name || (card.agentType === "custom" ? card.providerName || "Custom API" : kilo ? "Kilo AI Gateway" : "OmniRoute");
  const configuredModel = card.agentType === "custom" ? custom?.model || "" : kilo ? config.kiloModel : config.omniRouteModel;
  const model = configuredModel;
  const lastResponseModel =
    card.modelSource === "live" ? card.routedModel : undefined;
  const hasConversation = card.history.some(
    (line) =>
      line.type === "output" ||
      (line.type === "input" && !line.id.startsWith("init-")) ||
      line.type === "error",
  );
  const lastRequestId = useRef(requestId);
  useEffect(() => {
    const element = historyRef.current;
    if (!element) return;
    if (lastRequestId.current !== requestId) {
      lastRequestId.current = requestId;
      followingOutput.current = true;
    }
    if (!followingOutput.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (followingOutput.current) element.scrollTop = hasConversation ? element.scrollHeight : 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [card.history, busy, hasConversation, requestId]);
  const send = (value = prompt) => {
    if (!value.trim() || busy) return;
    onExecutePrompt(card.id, value.trim());
    setPrompt("");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        card.history
          .map((line) => `${line.type.toUpperCase()}: ${line.text}`)
          .join("\n\n"),
      );
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError(
        "Clipboard access is unavailable. Select the response to copy it.",
      );
    }
  };
  const expand = () => {
    if (oldSize.current) {
      onUpdate(oldSize.current);
      oldSize.current = null;
      setExpanded(false);
    } else {
      oldSize.current = { width: card.width, height: card.height };
      onUpdate({ width: 680, height: 620 });
      setExpanded(true);
    }
  };
  const Icon = kilo ? Sparkles : card.agentType === "omniroute" ? Radio : Bot;
  return (
    <section
      className={`cw-card cw-agent ${kilo ? "cw-kilo" : ""} ${isSelected ? "selected" : ""}`}
      style={{ width: card.width, height: card.height }}
      onClick={onSelect}
      aria-label={`${name} card`}
    >
      <header
        className="cw-card-header card-drag-handle"
        data-testid={`drag-${card.id}`}
      >
        <span className={`cw-icon-tile ${kilo ? "cyan" : ""}`}>
          <Icon size={17} />
        </span>
        <div className="cw-card-heading">
          <h2>
            {name}
            {card.parentId && (
              <span className="cw-worker-badge">
                <GitBranch size={9} /> Worker
              </span>
            )}
          </h2>
          <p>
            {providerName} <span>·</span>{" "}
            {isSimulated ? "Demo simulation" : "Live requests"}
          </p>
        </div>
        <span
          className={`cw-status ${busy ? "busy" : ""} ${card.status === "error" ? "error" : ""}`}
        >
          {busy ? (
            <Loader2 size={10} />
          ) : card.status === "error" ? (
            <AlertCircle size={10} />
          ) : (
            <i />
          )}
          {statusName(card)}
        </span>
        <div
          className="cw-header-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-label={`Copy ${name} conversation`}
            title="Copy conversation"
            onClick={copy}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            aria-label={`Expand ${name}`}
            title={expanded ? "Restore size" : "Expand card"}
            onClick={expand}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            aria-label={`Close ${name}`}
            title="Close card"
            onClick={onDelete}
          >
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="cw-model-row">
        <span className="cw-model-label">MODEL</span>
        <button onClick={onOpenSettings} title={model || "Choose a model"}>
          {model || "Choose a model"}
          <ChevronDown size={10} />
        </button>
        <span className="cw-token-count">
          {card.tokensUsed.toLocaleString()} tokens
        </span>
      </div>
      {lastResponseModel && lastResponseModel !== model && (
        <div className="cw-last-response-model" title={lastResponseModel}>
          Last response from <span>{lastResponseModel}</span>
        </div>
      )}
      <div
        className="cw-conversation"
        ref={historyRef}
        onScroll={(event) => { followingOutput.current = isNearScrollBottom(event.currentTarget); }}
        role="log"
        aria-label={`${name} conversation`}
        aria-live="polite"
      >
        {!hasConversation && (
          <div className="cw-agent-welcome">
            <span className={`cw-welcome-orbit ${kilo ? "cyan" : ""}`}>
              <Icon size={24} />
            </span>
            <h3>
              {kilo
                ? "A fresh perspective, on demand."
                : "Your next idea starts here."}
            </h3>
            <p>
              {kilo && !supportsLocalBridge()
                ? "Kilo needs the local app because its API blocks browser connections. You can connect a browser-compatible custom API in Settings."
                : kilo
                ? "Let Kilo select a current free model, then give it a task."
                : "Connect your gateway, choose a model, and bring your ideas to life."}
            </p>
            {kilo && !supportsLocalBridge() && <a className="cw-text-button" href="https://github.com/ahpah-dev/ahpah-canvas#start-locally" target="_blank" rel="noreferrer">Run locally <ChevronRight size={12} /></a>}
            <div className="cw-welcome-prompts">
              {["Explore an idea", "Review some code", "Make a plan"].map(
                (value) => (
                  <button
                    key={value}
                    disabled={busy}
                    onClick={() => setPrompt(value)}
                  >
                    {value}
                    <ArrowUp size={10} />
                  </button>
                ),
              )}
            </div>
            {!model && (
              <button className="cw-text-button" onClick={onOpenSettings}>
                <Settings2 size={12} /> Configure your connection
              </button>
            )}
          </div>
        )}
        {card.history.map((line: TerminalLine) => {
          if (line.type === "input" && line.id.startsWith("init-")) return null;
          if (!hasConversation && line.type === "system") return null;
          if (line.type === "input")
            return (
              <div className="cw-message cw-message-user" key={line.id}>
                <header>
                  <span>YOU</span>
                  <time>{line.timestamp}</time>
                </header>
                <p>{line.text.replace(/^›\s*/, "")}</p>
              </div>
            );
          if (line.type === "system" || line.type === "route")
            return (
              <div className="cw-system-line" key={line.id}>
                <Radio size={11} />
                <span>{line.text}</span>
              </div>
            );
          if (line.type === "error")
            return (
              <div className="cw-message-error" key={line.id}>
                <AlertCircle size={14} />
                <div>
                  <strong>Request needs attention</strong>
                  <p>{line.text}</p>
                  <button onClick={onOpenSettings}>
                    Check connection <ChevronRight size={11} />
                  </button>
                </div>
              </div>
            );
          return (
            <div className="cw-message cw-message-agent" key={line.id}>
              <header>
                <Icon size={12} />
                <span>
                  {isSimulated ? "DEMO RESPONSE" : name.toUpperCase()}
                </span>
                <time>{line.timestamp}</time>
              </header>
              <ResponseContent text={line.text} />
            </div>
          );
        })}
        {busy && (
          <div className="cw-thinking">
            <span>
              <i />
              <i />
              <i />
            </span>
            <div>
              <span role="status">
                {card.lastAction && card.lastAction !== "Waiting for gateway response"
                  ? card.lastAction
                  : `Waiting for ${providerName}`}
              </span>
              <small>{elapsed}s elapsed · Up to 3 minutes · Stop at any time.</small>
              {kilo && configuredModel === "kilo-auto/free" && (
                <small>Switches free models if no answer starts within 30s.</small>
              )}
            </div>
          </div>
        )}
        {copyError && (
          <p className="cw-inline-error" role="status">
            {copyError}
          </p>
        )}
      </div>
      {card.status === "approval_required" && (
        <div className="cw-plan-review">
          <span>Review this plan before continuing.</span>
          <button onClick={() => onApprovePlan(card.id)}>
            Continue <ChevronRight size={12} />
          </button>
        </div>
      )}
      <div className="cw-card-quick">
        <button
          onClick={() => setShowQuick(!showQuick)}
          aria-expanded={showQuick}
        >
          <Sparkles size={11} /> Prompt ideas <ChevronDown size={10} />
        </button>
        {onSpawnWorker && !card.parentId && (
          <button onClick={() => onSpawnWorker(card.id)}>
            <GitBranch size={11} /> Add Kilo worker
          </button>
        )}
      </div>
      {showQuick && (
        <div className="cw-quick-suggestions">
          {[
            "Summarize the context and suggest the next step.",
            "Review this approach for problems and improvements.",
            "Break this task into a practical implementation plan.",
          ].map((value) => (
            <button
              key={value}
              disabled={busy}
              onClick={() => setPrompt(value)}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      <form
        className="cw-card-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label={`Message ${name}`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={`Message ${name}…`}
          rows={2}
        />
        <div>
          <span>
            Enter to send <i>·</i> Shift + Enter for a new line
          </span>
          {busy ? (
            <button
              type="button"
              className="cw-send-button stop"
              aria-label={`Stop ${name} request`}
              onClick={() => onStopPrompt(card.id)}
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              className="cw-send-button"
              type="submit"
              disabled={!prompt.trim()}
              aria-label={`Send to ${name}`}
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

export const AgentCard = memo(AgentCardBody, (previous, next) =>
  hasSameCardContent(previous.card, next.card) &&
  (Object.keys(next) as (keyof AgentCardProps)[]).every((key) =>
    key === "card" || Object.is(previous[key], next[key])));
