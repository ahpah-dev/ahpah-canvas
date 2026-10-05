import React, { useRef, useState } from "react";
import {
  FolderGit2,
  X,
  Download,
  Upload,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { WorkspacePreset } from "../../types/canvas";
import { WORKSPACE_PRESETS } from "../../data/mockAgents";
import { useDialogFocus } from "../../utils/useDialogFocus";
import { useDialogPresence } from "../../utils/useDialogPresence";

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPreset: (preset: WorkspacePreset) => void;
  onExportWorkspace: () => void;
  onImportWorkspace: (jsonString: string) => boolean | string;
  onResetWorkspace: () => void;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onLoadPreset,
  onExportWorkspace,
  onImportWorkspace,
  onResetWorkspace,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState("");
  useDialogFocus(isOpen, onClose);
  const present = useDialogPresence(isOpen);

  if (!present) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportError("");

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = onImportWorkspace(content || "");
      if (result === true) onClose();
      else
        setImportError(
          typeof result === "string"
            ? result
            : "This workspace could not be imported.",
        );
    };
    reader.onerror = () =>
      setImportError(
        "This file could not be read. Choose a valid workspace JSON file.",
      );
    reader.readAsText(file);
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
        aria-label="Workspaces"
        className="cw-modal bg-[#0e131d] border border-cyan-500/30 rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#121824] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Workspaces & Presets
              </h3>
              <p className="text-xs text-slate-400">
                Save, load, and restore multi-agent layouts and sessions.
              </p>
            </div>
          </div>
          <button
            aria-label="Close workspaces"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 bg-[#080b11]">
          {importError && (
            <p
              role="alert"
              className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-xs text-rose-200"
            >
              {importError}
            </p>
          )}
          {/* Presets List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Curated
              Workspace Presets
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {WORKSPACE_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="p-4 rounded-xl bg-[#111724] border border-slate-800 hover:border-cyan-500/50 transition-all flex items-center justify-between gap-4 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-white">
                        {preset.name}
                      </span>
                      <div className="flex items-center gap-1">
                        {preset.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {preset.description}
                    </p>
                    <div className="text-[10px] text-slate-500 mt-2">
                      {preset.cards.length} cards · {preset.connections.length}{" "}
                      connections · {preset.memory.length} memory keys
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onLoadPreset(preset);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shrink-0 shadow"
                  >
                    Load Preset
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Import / Export actions */}
          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Local Backup & Portability
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={onExportWorkspace}
                className="p-3 rounded-xl bg-[#121825] border border-slate-800 hover:border-slate-700 flex flex-col items-center justify-center gap-2 text-slate-200 hover:text-white transition-colors"
              >
                <Download className="w-5 h-5 text-cyan-400" />
                <span className="text-xs font-semibold">Export JSON</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl bg-[#121825] border border-slate-800 hover:border-slate-700 flex flex-col items-center justify-center gap-2 text-slate-200 hover:text-white transition-colors"
              >
                <Upload className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-semibold">Import JSON</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".json"
                  className="hidden"
                />
              </button>

              <button
                onClick={() => {
                  onResetWorkspace();
                  onClose();
                }}
                className="p-3 rounded-xl bg-[#121825] border border-slate-800 hover:border-rose-500/40 flex flex-col items-center justify-center gap-2 text-slate-200 hover:text-rose-400 transition-colors"
              >
                <RotateCcw className="w-5 h-5 text-rose-400" />
                <span className="text-xs font-semibold">Reset to Default</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
