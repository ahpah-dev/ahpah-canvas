import React, { useState } from "react";
import { Database, X, Plus, Search, Copy, Check } from "lucide-react";
import { MemoryItem } from "../../types/canvas";
import { useDialogFocus } from "../../utils/useDialogFocus";
import { useDialogPresence } from "../../utils/useDialogPresence";

interface MemoryHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: MemoryItem[];
  onAddMemory: (item: Omit<MemoryItem, "id" | "timestamp">) => void;
  onDeleteMemory: (id: string) => void;
}

export const MemoryHubModal: React.FC<MemoryHubModalProps> = ({
  isOpen,
  onClose,
  memory,
  onAddMemory,
  onDeleteMemory,
}) => {
  const [activeTab, setActiveTab] = useState<
    "all" | "decision" | "fact" | "changelog"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newType, setNewType] = useState<"decision" | "fact">("decision");
  const [isCopied, setIsCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  useDialogFocus(isOpen, onClose);
  const present = useDialogPresence(isOpen);

  if (!present) return null;

  const filtered = memory.filter((m) => {
    const matchesTab = activeTab === "all" || m.type === activeTab;
    const matchesSearch =
      m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    onAddMemory({
      key: newKey.trim(),
      value: newValue.trim(),
      author: "User",
      type: newType,
    });
    setNewKey("");
    setNewValue("");
  };

  const handleCopyBriefing = async () => {
    const briefing = memory
      .map(
        (m) =>
          `[${m.type.toUpperCase()}] ${m.key}: ${m.value} (by ${m.author})`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(briefing);
      setIsCopied(true);
      setCopyError("");
    } catch {
      setCopyError("Clipboard access is unavailable.");
    }
  };

  return (
    <div
      data-state={isOpen ? "open" : "closed"}
      className="cw-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-hidden={!isOpen}
        aria-modal="true"
        aria-label="Project memory"
        className="cw-modal bg-[#0e131d] border border-cyan-500/30 rounded-2xl w-full max-w-3xl max-h-[85vh] shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#121824] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  AhPah Shared Memory Hub
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Browser storage
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Project facts and decisions are included with your gateway
                prompts.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyBriefing}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
              title="Copy session briefing to clipboard"
            >
              {isCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{isCopied ? "Copied Briefing!" : "Copy Briefing"}</span>
            </button>
            <button
              aria-label="Close project memory"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="px-6 py-3 border-b border-slate-800 bg-[#0b0f17] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-[#121824] p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === "all"
                  ? "bg-cyan-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All ({memory.length})
            </button>
            <button
              onClick={() => setActiveTab("decision")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === "decision"
                  ? "bg-cyan-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Decisions
            </button>
            <button
              onClick={() => setActiveTab("fact")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === "fact"
                  ? "bg-cyan-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Facts
            </button>
            <button
              onClick={() => setActiveTab("changelog")}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === "changelog"
                  ? "bg-cyan-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Changelog
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keys, values, agents..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#121824] border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Memory Items List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-[#080b11]">
          {copyError && (
            <p role="status" className="text-xs text-rose-200">
              {copyError}
            </p>
          )}
          {filtered.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-xl bg-[#0f1420] border border-slate-800/80 hover:border-slate-700 transition-all flex items-start justify-between gap-3 group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      item.type === "decision"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : item.type === "fact"
                          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    }`}
                  >
                    {item.type}
                  </span>
                  <span className="font-mono text-xs font-bold text-cyan-300 truncate">
                    {item.key}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-auto">
                    {item.author} • {item.timestamp}
                  </span>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed font-sans">
                  {item.value}
                </div>
              </div>

              <button
                aria-label={`Delete memory ${item.key}`}
                onClick={() => onDeleteMemory(item.id)}
                className="p-1 rounded text-slate-500 hover:text-rose-400 transition-all"
                title="Delete memory key"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-xs">
              No memory items match your filter. Add one below!
            </div>
          )}
        </div>

        {/* Add Memory Form */}
        <form
          onSubmit={handleAdd}
          className="p-4 border-t border-slate-800 bg-[#101623] flex flex-wrap items-center gap-2"
        >
          <select
            aria-label="Memory type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs bg-[#090d15] border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="decision">Decision</option>
            <option value="fact">Fact</option>
          </select>
          <input
            aria-label="Memory key"
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Key (e.g. auth.strategy)..."
            className="w-1/3 px-3 py-1.5 text-xs bg-[#090d15] border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
          <input
            aria-label="Memory value"
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Value or rule..."
            className="flex-1 px-3 py-1.5 text-xs bg-[#090d15] border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!newKey.trim() || !newValue.trim()}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 shadow transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>
      </div>
    </div>
  );
};
