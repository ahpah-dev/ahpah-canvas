import React, { useEffect, useRef, useState } from "react";
import { Terminal, Copy, Check, X, ArrowUp } from "lucide-react";
import type { CanvasCard } from "../../types/canvas";
interface TerminalCardProps {
  card: CanvasCard;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<CanvasCard>) => void;
  onDelete: () => void;
}
export function TerminalCard({
  card,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
}: TerminalCardProps) {
  const [command, setCommand] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [card.history.length]);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!command.trim()) return;
    onUpdate({
      history: [
        ...card.history,
        {
          id: crypto.randomUUID(),
          text: command.trim(),
          type: "input",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ],
      lastAction: "Command saved to scratchpad",
    });
    setCommand("");
    setCopied(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        card.history
          .filter((line) => line.type === "input")
          .map((line) => line.text.replace(/^\$\s*/, ""))
          .join("\n"),
      );
      setCopied(true);
      setError("");
    } catch {
      setError(
        "Clipboard access is unavailable. Select the command to copy it.",
      );
    }
  };
  return (
    <section
      className={`cw-card cw-terminal ${isSelected ? "selected" : ""}`}
      style={{ width: card.width, height: card.height }}
      onClick={onSelect}
      aria-label="Command scratchpad card"
    >
      <header
        className="cw-card-header card-drag-handle"
        data-testid={`drag-${card.id}`}
      >
        <span className="cw-icon-tile">
          <Terminal size={17} />
        </span>
        <div className="cw-card-heading">
          <h2>Command scratchpad</h2>
          <p>Your commands, ready to copy.</p>
        </div>
        <div
          className="cw-header-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <button aria-label="Copy saved commands" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button aria-label="Close command scratchpad" onClick={onDelete}>
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="cw-scratchpad-info">
        Keep commands here and run them in your local terminal.
      </div>
      <div className="cw-terminal-body" ref={log}>
        {card.history
          .filter((line) => line.type === "input")
          .map((line) => (
            <div key={line.id}>
              <span>$</span>
              <pre>{line.text.replace(/^\$\s*/, "")}</pre>
              <time>{line.timestamp}</time>
            </div>
          ))}
        {!card.history.some((line) => line.type === "input") && (
          <div className="cw-tool-empty">
            <Terminal size={30} />
            <h3>Keep your next command close.</h3>
            <p>
              Save a command below, then copy it into your terminal when you’re
              ready.
            </p>
          </div>
        )}
      </div>
      {error && (
        <p className="cw-inline-error" role="status">
          {error}
        </p>
      )}
      <form className="cw-scratchpad-composer" onSubmit={save}>
        <span>$</span>
        <input
          aria-label="Command to save"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Save a command, e.g. npm run dev"
        />
        <button
          className="cw-send-button"
          type="submit"
          disabled={!command.trim()}
          aria-label="Save command"
        >
          <ArrowUp size={15} />
        </button>
      </form>
      <footer className="cw-tool-footer">
        <span>Scratchpad · no shell execution</span>
        <span>
          {copied ? "Copied to clipboard" : "Stored in your workspace"}
        </span>
      </footer>
    </section>
  );
}
