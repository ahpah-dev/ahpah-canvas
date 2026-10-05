import React, { useState } from "react";
import {
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Sparkles,
  FileText,
  FileCode2,
  Globe,
  Terminal,
  Search,
  ArrowUpRight,
  Database,
  ChevronRight,
} from "lucide-react";
import type { CanvasCard } from "../../types/canvas";
import { cardName, isBusy, statusName } from "../../utils/cardPresentation";
interface MissionControlProps {
  saveError: boolean;
  cards: CanvasCard[];
  isOpen: boolean;
  onToggle: () => void;
  onFocusCard: (id: string) => void;
  onBroadcastPrompt: (prompt: string) => void;
  onOpenMemory: () => void;
  onOpenWorkspaces: () => void;
  onOpenCode?: () => void;
  selectedCardId: string | null;
}
export function MissionControl({
  saveError,
  cards,
  isOpen,
  onToggle,
  onFocusCard,
  onOpenMemory,
  onOpenWorkspaces,
  onOpenCode,
  selectedCardId,
}: MissionControlProps) {
  const [search, setSearch] = useState("");
  const agents = cards.filter((card) => card.type === "agent");
  const filtered = cards.filter((card) =>
    cardName(card).toLowerCase().includes(search.toLowerCase()),
  );
  const active = agents.filter(isBusy).length;
  const tokens = agents.reduce((sum, card) => sum + card.tokensUsed, 0);
  return (
    <aside
      className={`cw-sidebar ${isOpen ? "open" : "collapsed"}`}
      aria-label="Mission Control"
    >
      <header>
        <span className="cw-icon-tile">
          <Layers3 size={16} />
        </span>
        {isOpen && (
          <div>
            <h2>Mission Control</h2>
            <p>Agents, reviews, and project context.</p>
          </div>
        )}
        <button
          aria-label={
            isOpen ? "Collapse Mission Control" : "Expand Mission Control"
          }
          onClick={onToggle}
        >
          {isOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={17} />}
        </button>
      </header>
      {isOpen ? (
        <>
          <div className="cw-sidebar-stats">
            <div>
              <span>RESPONDING</span>
              <strong>
                {active}
                <small> / {agents.length}</small>
              </strong>
            </div>
            <div>
              <span>TOKENS USED</span>
              <strong>{tokens.toLocaleString()}</strong>
            </div>
          </div>
          <label className="cw-sidebar-search">
            <Search size={13} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a card…"
              aria-label="Find a canvas card"
            />
            <kbd>⌕</kbd>
          </label>
          <div className="cw-sidebar-list">
            <div className="cw-sidebar-section-title">
              AGENTS <span>{agents.length}</span>
            </div>
            {filtered
              .filter((card) => card.type === "agent")
              .map((card) => {
                const Icon = card.agentType === "kilo" ? Sparkles : Radio;
                return (
                  <button
                    className={`cw-session ${selectedCardId === card.id ? "selected" : ""}`}
                    key={card.id}
                    onClick={() => onFocusCard(card.id)}
                    aria-label={`Focus ${cardName(card)}`}
                  >
                    <span
                      className={`cw-icon-tile ${card.agentType === "kilo" ? "cyan" : ""}`}
                    >
                      <Icon size={15} />
                    </span>
                    <div>
                      <strong>{cardName(card)}</strong>
                      <small>{statusName(card)}</small>
                    </div>
                    <span
                      className={`cw-session-dot ${isBusy(card) ? "active" : ""} ${card.status === "error" ? "error" : ""}`}
                    />
                    <ArrowUpRight size={12} />
                  </button>
                );
              })}
            <div className="cw-sidebar-section-title">
              TOOLS & NOTES <span>{cards.length - agents.length}</span>
            </div>
            {filtered
              .filter((card) => card.type !== "agent")
              .map((card) => {
                const Icon =
                  card.type === "note"
                    ? FileText
                    : card.type === "browser"
                      ? Globe
                      : Terminal;
                return (
                  <button
                    className={`cw-session tool ${selectedCardId === card.id ? "selected" : ""}`}
                    key={card.id}
                    onClick={() => onFocusCard(card.id)}
                  >
                    <Icon size={14} />
                    <div>
                      <strong>{card.title}</strong>
                      <small>
                        {card.type === "terminal"
                          ? "Command scratchpad"
                          : card.type === "browser"
                            ? "Web preview"
                            : "Project context"}
                      </small>
                    </div>
                    <ArrowUpRight size={12} />
                  </button>
                );
              })}
            {!filtered.length && (
              <div className="cw-sidebar-empty">
                {search
                  ? "No cards match your search."
                  : "Your workspace is ready for its first card."}
              </div>
            )}
          </div>
          <div className="cw-sidebar-footer">
            {onOpenCode && <button onClick={onOpenCode}>
              <FileCode2 size={14} />
              <div>Code workspace<small>Files, agent tasks & reviewed edits</small></div>
              <ChevronRight size={13} />
            </button>}
            <button onClick={onOpenMemory}>
              <Database size={14} />
              <div>
                Project memory<small>The context worth keeping</small>
              </div>
              <ChevronRight size={13} />
            </button>
            <button onClick={onOpenWorkspaces}>
              <Layers3 size={14} />
              <div>
                Workspaces<small>Layouts, import & export</small>
              </div>
              <ChevronRight size={13} />
            </button>
            <p role={saveError ? "alert" : undefined}>
              <span className="cw-dot" />{" "}
              {saveError
                ? "Autosave unavailable · export your work"
                : "Saved in this browser"}
            </p>
          </div>
        </>
      ) : (
        <div className="cw-sidebar-rail">
          {onOpenCode && <button aria-label="Open code workspace" onClick={onOpenCode}><FileCode2 size={17} /></button>}
          <button aria-label="Open project memory" onClick={onOpenMemory}>
            <Database size={17} />
          </button>
          <button aria-label="Open workspaces" onClick={onOpenWorkspaces}>
            <Layers3 size={17} />
          </button>
        </div>
      )}
    </aside>
  );
}
