import { useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";
import type { CanvasCard, Connection } from "../../types/canvas";
import { buildCanvasBrief } from "../../utils/canvasBrief";
import { useDialogFocus } from "../../utils/useDialogFocus";
import "./canvasBrief.css";

interface CanvasBriefDialogProps {
  cards: CanvasCard[];
  connections: Connection[];
  onClose: () => void;
}

export function CanvasBriefDialog({ cards, connections, onClose }: CanvasBriefDialogProps) {
  // Snapshot when opened, so the brief stays stable while you copy it.
  const [brief] = useState(() => buildCanvasBrief(cards, connections));
  const [copied, setCopied] = useState(false);
  useDialogFocus(true, onClose);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be blocked; the preview stays selectable.
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([brief], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `canvas-brief-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div
      className="cw-brief-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="cw-brief" role="dialog" aria-modal="true" aria-labelledby="cw-brief-title">
        <header>
          <div>
            <span>HANDOFF</span>
            <h2 id="cw-brief-title">Canvas brief</h2>
          </div>
          <button type="button" aria-label="Close canvas brief" onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        <p>
          A Markdown summary of your agents, notes, and connections. Paste it into a new agent,
          a task, or a pull request. It reads only what the canvas shows, not your provider settings.
        </p>
        <pre tabIndex={0} aria-label="Brief preview">{brief}</pre>
        <footer>
          <button type="button" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={download}>
            <Download size={13} />
            Download .md
          </button>
        </footer>
      </section>
    </div>
  );
}
