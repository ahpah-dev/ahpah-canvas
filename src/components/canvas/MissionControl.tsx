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
import { getAgentIdentity } from '../../utils/agentIdentity';
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
  const [filter, setFilter] = useState<'all' | 'agents' | 'tools' | 'review'>('all');
  const agents = cards.filter((card) => card.type === "agent");
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearch = cards.filter(card => {
    const text = `${cardName(card)} ${card.title} ${card.type} ${card.providerName ?? ''} ${card.agentType ?? ''} ${card.routedModel ?? ''} ${statusName(card)} ${card.type === 'agent' ? getAgentIdentity(card).role : ''}`.toLowerCase();
    return terms.every(term => text.includes(term));
  });
  const filtered = matchesSearch.filter(card => filter === 'all' || (filter === 'agents' && card.type === 'agent') || (filter === 'tools' && card.type !== 'agent') || (filter === 'review' && (card.status === 'error' || card.status === 'approval_required')));
  const needsReview = cards.filter(card => card.status === 'error' || card.status === 'approval_required').length;
  const active = agents.filter(isBusy).length;
  const tokens = agents.reduce((sum, card) => sum + card.tokensUsed, 0);
  return (<>
    {isOpen && <button className="cw-sidebar-dismiss" aria-label="Close workspace navigation" onClick={onToggle} />}
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
          aria-expanded={isOpen}
        >
          {isOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={17} />}
        </button>
      </header>
      {isOpen ? (
        <>
          <div className="cw-sidebar-stats">
            <div>
              <span>AGENTS WORKING</span>
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
              onKeyDown={event => {
                if (event.key === 'Enter' && filtered[0]) { event.preventDefault(); onFocusCard(filtered[0].id); }
                if (event.key === 'Escape') { event.preventDefault(); setSearch(''); }
              }}
              placeholder="Find agents, models, tools…"
              aria-label="Find a canvas card"
            />
            {search && <button aria-label="Clear card search" onClick={() => setSearch('')}><span aria-hidden="true">×</span></button>}
          </label>
          <div className="cw-sidebar-filters" role="group" aria-label="Filter canvas cards">
            {([{ id: 'all', label: 'All' }, { id: 'agents', label: 'Agents' }, { id: 'tools', label: 'Tools' }, { id: 'review', label: `Review${needsReview ? ` ${needsReview}` : ''}` }] as const).map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
          <div className="cw-sidebar-list">
            {filter !== 'tools' && <div className="cw-sidebar-section-title">
              AGENTS <span>{filtered.filter(card => card.type === 'agent').length}</span>
            </div>}
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
                    aria-current={selectedCardId === card.id ? 'true' : undefined}
                  >
                    <span
                      className={`cw-icon-tile ${card.agentType === "kilo" ? "cyan" : ""}`}
                    >
                      <Icon size={15} />
                    </span>
                    <div>
                      <strong>{cardName(card)}</strong>
                      <small>{getAgentIdentity(card).role} · {statusName(card)}</small>
                    </div>
                    <span
                      className={`cw-session-dot ${isBusy(card) ? "active" : ""} ${card.status === "error" ? "error" : ""}`}
                    />
                    <ArrowUpRight size={12} />
                  </button>
                );
              })}
            {(filter === 'all' || filter === 'tools') && <div className="cw-sidebar-section-title">
              TOOLS & NOTES <span>{filtered.filter(card => card.type !== 'agent').length}</span>
            </div>}
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
                    aria-current={selectedCardId === card.id ? 'true' : undefined}
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
              <div className="cw-sidebar-empty" role="status">
                <Search size={20} aria-hidden="true" />
                <strong>{search ? 'No matching cards' : filter === 'review' ? 'Everything is clear' : 'Room for your next idea'}</strong>
                <p>{search ? 'Try a different name or show all cards.' : filter === 'review' ? 'Cards awaiting approval or needing attention appear here.' : 'Add a card from the canvas to begin.'}</p>
                {(search || filter !== 'all') && <button onClick={() => { setSearch(''); setFilter('all'); }}>Show all cards</button>}
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
    </aside></>
  );
}
