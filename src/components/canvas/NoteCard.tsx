import React, { useState } from "react";
import { FileText, X, Edit3, Eye } from "lucide-react";
import type { CanvasCard } from "../../types/canvas";
interface NoteCardProps {
  card: CanvasCard;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<CanvasCard>) => void;
  onDelete: () => void;
}
export function NoteCard({
  card,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
}: NoteCardProps) {
  const [editing, setEditing] = useState(false);
  const content = card.noteContent || "";
  const toggleCheck = (index: number) => {
    const lines = content.split("\n");
    lines[index] = lines[index].replace(/\[([ x])\]/, (_, check) =>
      check === "x" ? "[ ]" : "[x]",
    );
    onUpdate({ noteContent: lines.join("\n") });
  };
  return (
    <section
      className={`cw-card cw-note ${isSelected ? "selected" : ""}`}
      style={{ width: card.width, height: card.height }}
      onClick={onSelect}
      aria-label="Project notes card"
    >
      <header
        className="cw-card-header card-drag-handle"
        data-testid={`drag-${card.id}`}
      >
        <span className="cw-icon-tile amber">
          <FileText size={17} />
        </span>
        <div className="cw-card-heading">
          <h2>{card.title}</h2>
          <p>Ideas, decisions, and a little context.</p>
        </div>
        <div
          className="cw-header-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-label={editing ? "Preview notes" : "Edit notes"}
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? <Eye size={14} /> : <Edit3 size={14} />}
          </button>
          <button aria-label="Close notes" onClick={onDelete}>
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="cw-note-body">
        {editing ? (
          <textarea
            aria-label="Note content"
            value={content}
            onChange={(event) => onUpdate({ noteContent: event.target.value })}
            placeholder="Write a thought. Make a plan. Leave yourself a little context."
          />
        ) : (
          <div>
            {content.split("\n").map((line, index) => {
              if (line.startsWith("# "))
                return <h2 key={index}>{line.slice(2)}</h2>;
              if (line.startsWith("## "))
                return <h3 key={index}>{line.slice(3)}</h3>;
              const check = line.match(/^- \[([ x])\] (.*)/);
              if (check)
                return (
                  <label className="cw-note-check" key={index}>
                    <input
                      type="checkbox"
                      checked={check[1] === "x"}
                      onChange={() => toggleCheck(index)}
                    />
                    <span className={check[1] === "x" ? "checked" : ""}>
                      {check[2]}
                    </span>
                  </label>
                );
              if (line.startsWith("- "))
                return (
                  <p className="cw-note-bullet" key={index}>
                    • {line.slice(2)}
                  </p>
                );
              return line ? (
                <p key={index}>{line}</p>
              ) : (
                <div className="cw-note-space" key={index} />
              );
            })}
          </div>
        )}
      </div>
      <footer className="cw-tool-footer">
        <span>{editing ? "Editing Markdown" : "Project notes"}</span>
        <span>{content.length.toLocaleString()} characters</span>
      </footer>
    </section>
  );
}
