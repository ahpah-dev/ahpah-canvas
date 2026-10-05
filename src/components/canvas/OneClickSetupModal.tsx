import React from "react";
import { ArrowRight, KeyRound, X, Zap } from "lucide-react";
import { useDialogPresence } from "../../utils/useDialogPresence";
import { useDialogFocus } from "../../utils/useDialogFocus";
import { OmniRouteSetupButton } from './OmniRouteSetupButton';

interface OneClickSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onApplyOneClickSetup: () => void;
  onOmniRouteConnected: () => void;
}

export const OneClickSetupModal: React.FC<OneClickSetupModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onApplyOneClickSetup,
  onOmniRouteConnected,
}) => {
  const present = useDialogPresence(isOpen);
  useDialogFocus(isOpen, onClose);
  if (!present) return null;

  return (
    <div
      data-state={isOpen ? "open" : "closed"}
      className="cw-overlay fixed inset-0 z-50 flex items-center justify-center bg-[#03050a]/80 p-4 backdrop-blur-lg"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-hidden={!isOpen}
        aria-modal="true"
        aria-labelledby="setup-title"
        className="cw-modal w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0d121c] shadow-[0_32px_120px_rgba(0,0,0,.7)]"
      >
        <header className="flex items-center justify-between border-b border-white/[.07] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200">
              <Zap size={19} />
            </div>
            <div>
              <h2
                id="setup-title"
                className="text-base font-semibold text-white"
              >
                Connect your providers
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                A quick setup for live model requests.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close setup"
            className="rounded-xl p-2 text-slate-500 hover:bg-white/[.06] hover:text-white"
          >
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[calc(90vh-6rem)] space-y-4 overflow-y-auto p-6">
          <p className="text-sm leading-relaxed text-slate-300">
            Add your gateway details once. The model pickers will use the latest
            catalogs available from each service.
          </p>
          <div className="space-y-3">
            <OmniRouteSetupButton onConnected={onOmniRouteConnected} onOpenSettings={() => { onOpenSettings(); onClose(); }} />
            <div className="flex gap-3 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.035] p-4">
              <KeyRound
                size={17}
                className="mt-0.5 shrink-0 text-emerald-200"
              />
              <p className="text-xs leading-relaxed text-slate-300">
                <strong className="text-white">Kilo AI Gateway</strong>
                <br />
                Choose <code className="text-emerald-200">kilo-auto/free</code>.
                Kilo updates the free model behind this route automatically; an
                API key is optional.
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => {
                onApplyOneClickSetup();
                onClose();
              }}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-slate-400 transition hover:text-white"
            >
              Open canvas
            </button>
            <button
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Open connection settings <ArrowRight size={14} />
            </button>
          </div>
          <p className="text-center text-[11px] text-slate-500">
            API keys are saved in this browser. Auto Free is free, subject to
            Kilo availability and rate limits.
          </p>
        </div>
      </div>
    </div>
  );
};
