import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Radio,
  RefreshCw,
  Settings,
  Sparkles,
  X,
  Zap,
  Palette,
  Square,
  ChevronDown,
  Cpu,
  Code2,
  Plug,
  ArrowRight,
} from "lucide-react";
import {
  listKiloModels,
  listOmniRouteModels,
  sendGatewayPrompt,
  type GatewayModel,
  loadGatewayConfig,
  saveGatewayConfig,
  gatewayTransport,
  supportsLocalBridge,
  type CustomProvider,
  type GatewayTransport,
} from "../../utils/gateways";
import { CustomProvidersPanel } from "./CustomProvidersPanel";
import { LocalModelsPanel } from "./LocalModelsPanel";
import { CodexConnectionPanel } from "./CodexConnectionPanel";
import { OmniRouteSetupButton } from './OmniRouteSetupButton';
import { useDialogFocus } from "../../utils/useDialogFocus";
import { useDialogPresence } from "../../utils/useDialogPresence";
import {
  autoConfigureGateways,
  KILO_CODING_PROBE,
  validateKiloCodingProbe,
  type SetupProgress,
} from "../../utils/autoConfiguration";
import { AppearancePanel } from "./AppearancePanel";
import { ModelSelector } from "./ModelSelector";
import {
  currentModelRecommendations,
  isAutomaticModel,
  isFreeModel,
} from "../../utils/modelCatalog";

interface SettingsModalProps {
  isOpen: boolean;
  connectionTarget?: 'local' | 'hosted';
  onClose: () => void;
  isSimulated: boolean;
  onToggleSimulated: (val: boolean) => void;
  onAutoConfigured: (providers: ("omniroute" | "kilo")[]) => void;
  onAddCustomProvider: (providerId: string) => void;
  onConnectLocal: () => void;
  onConnectCodex: () => void;
  onConnectOmniRoute: () => void;
}

type ConnectionState = "idle" | "checking" | "connected" | "verified" | "error";

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
  visible,
  toggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  secret?: boolean;
  visible?: boolean;
  toggle?: () => void;
}) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-medium text-slate-300">{label}</span>
    <span className="relative block">
      <input
        type={secret && !visible ? "password" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-[#0b0a12] px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/10"
      />
      {secret && toggle && (
        <button
          type="button"
          onClick={toggle}
          aria-label={visible ? "Hide API key" : "Show API key"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </span>
  </label>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  connectionTarget,
  onClose,
  isSimulated,
  onToggleSimulated,
  onAutoConfigured,
  onAddCustomProvider,
  onConnectLocal,
  onConnectCodex,
  onConnectOmniRoute,
}) => {
  useDialogFocus(isOpen, onClose);
  const present = useDialogPresence(isOpen);
  const [tab, setTab] = useState<"connections" | "appearance">("connections");
  const [previousTarget, setPreviousTarget] = useState(connectionTarget);
  if (connectionTarget !== previousTarget) {
    setPreviousTarget(connectionTarget);
    if (connectionTarget) setTab('connections');
  }
  const hostedOptions = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const jumpToConnection = (id: string) => {
    if (id !== 'local' && hostedOptions.current) hostedOptions.current.open = true;
    requestAnimationFrame(() => {
      const section = dialog.current?.querySelector<HTMLElement>(`#connection-${id}`);
      section?.scrollIntoView({ block: 'start', behavior: 'instant' });
      section?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (!isOpen || !connectionTarget) return;
    const frame = requestAnimationFrame(() => {
      if (hostedOptions.current) hostedOptions.current.open = connectionTarget === 'hosted';
      const section = dialog.current?.querySelector<HTMLElement>(`#connection-${connectionTarget === 'local' ? 'local' : 'codex'}`);
      section?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, connectionTarget]);
  const [omniRouteUrl, setOmniRouteUrl] = useState(
    () => loadGatewayConfig().omniRouteUrl,
  );
  const [omniRouteKey, setOmniRouteKey] = useState(
    () => loadGatewayConfig().omniRouteKey,
  );
  const [omniRouteModel, setOmniRouteModel] = useState(
    () => loadGatewayConfig().omniRouteModel,
  );
  const [kiloKey, setKiloKey] = useState(() => loadGatewayConfig().kiloKey);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>(() => loadGatewayConfig().customProviders || []);
  const [transport, setTransport] = useState<GatewayTransport>(() => loadGatewayConfig().transport || "auto");
  const [kiloModel, setKiloModel] = useState(
    () => loadGatewayConfig().kiloModel,
  );
  const [omniModels, setOmniModels] = useState<GatewayModel[]>([]);
  const [kiloModels, setKiloModels] = useState<GatewayModel[]>([]);
  const [omniState, setOmniState] = useState<ConnectionState>("idle");
  const [kiloState, setKiloState] = useState<ConnectionState>("idle");
  const [omniError, setOmniError] = useState("");
  const [kiloError, setKiloError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showOmniKey, setShowOmniKey] = useState(false);
  const [showKiloKey, setShowKiloKey] = useState(false);
  const [autoOnOpen, setAutoOnOpen] = useState(
    () => {
      try { return supportsLocalBridge() && localStorage.getItem("ahpah_auto_setup_on_open") === "true"; }
      catch { return false; }
    },
  );
  const [running, setRunning] = useState(false);
  const [omniQuickRunning, setOmniQuickRunning] = useState(false);
  const [setup, setSetup] = useState<
    Partial<Record<"omniroute" | "kilo", SetupProgress>>
  >({});
  const [diagnostics, setDiagnostics] = useState<SetupProgress[]>([]);
  const [setupMessage, setSetupMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const checkingCatalog = omniState === "checking" || kiloState === "checking";
  const setupController = useRef<AbortController | null>(null);
  const kiloCheckController = useRef<AbortController | null>(null);
  const omniCheckController = useRef<AbortController | null>(null);
  const automaticallyStarted = useRef(false);
  const runAuto = useCallback(async () => {
    if (setupController.current || checkingCatalog || omniQuickRunning) return;
    const controller = new AbortController();
    setupController.current = controller;
    setRunning(true);
    setSetup({});
    setDiagnostics([]);
    setSetupMessage("");
    setSaveError("");
    try {
      const result = await autoConfigureGateways(
        { ...loadGatewayConfig(), transport, omniRouteUrl, omniRouteKey, omniRouteModel, kiloKey, kiloModel },
        AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
        (progress) => {
          setSetup((previous) => ({
            ...previous,
            [progress.provider]: progress,
          }));
          setDiagnostics((previous) => [...previous, progress].slice(-30));
        },
      );
      if (controller.signal.aborted) return;
      const ready = result.providers
        .filter((provider) => provider.verified)
        .map((provider) => provider.provider);
      setOmniModels(result.providers[0].models);
      setKiloModels(result.providers[1].models);
      setOmniState(result.providers[0].verified ? "verified" : "error");
      setKiloState(result.providers[1].verified ? "verified" : "error");
      setOmniError(
        result.providers[0].verified ? "" : result.providers[0].detail,
      );
      setKiloError(
        result.providers[1].verified ? "" : result.providers[1].detail,
      );
      if (ready.length) {
        const verifiedConfig = result.providers.reduce(
          (next, provider) => ({ ...next, ...provider.config }),
          { ...loadGatewayConfig(), transport },
        );
        try {
          saveGatewayConfig(verifiedConfig);
        } catch {
          setSaveError(
            "The browser could not save the verified configuration. Check browser storage and retry.",
          );
          setSetupMessage(
            "Routes responded, but their settings could not be saved.",
          );
          return;
        }
        if (result.providers[0].verified) {
          setOmniRouteUrl(verifiedConfig.omniRouteUrl);
          setOmniRouteModel(verifiedConfig.omniRouteModel);
        }
        if (result.providers[1].verified)
          setKiloModel(verifiedConfig.kiloModel);
        onToggleSimulated(false);
        onAutoConfigured(ready);
        setSetupMessage(
          ready.length === 2
            ? "Both gateways are verified and saved. Your workspace is ready."
            : "Your working gateway is saved. Review the other connection below.",
        );
      } else
        setSetupMessage(
          "No verified route found. Your saved settings were kept. Review the diagnostics or add your provider credentials.",
        );
    } catch (error) {
      setSetupMessage(
        controller.signal.aborted
          ? "Setup stopped. Your saved settings were kept."
          : error instanceof Error && error.name === "TimeoutError"
            ? "Setup timed out. Your saved settings were kept; you can retry."
            : "Setup could not finish. Your saved settings were kept.",
      );
    } finally {
      if (setupController.current === controller) {
        setupController.current = null;
        setRunning(false);
      }
    }
  }, [
    omniRouteUrl,
    omniRouteKey,
    omniRouteModel,
    kiloKey,
    kiloModel,
    onAutoConfigured,
    onToggleSimulated,
    checkingCatalog,
    omniQuickRunning,
    transport,
  ]);
  useEffect(() => {
    if (!isOpen || !autoOnOpen || automaticallyStarted.current) return;
    const timer = window.setTimeout(() => {
      automaticallyStarted.current = true;
      void runAuto();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [isOpen, autoOnOpen, runAuto]);
  useEffect(() => () => setupController.current?.abort(), []);
  useEffect(() => {
    if (!isOpen) setupController.current?.abort();
    return () => { omniCheckController.current?.abort(); omniCheckController.current = null; };
  }, [isOpen, omniRouteUrl, omniRouteKey, transport]);
  useEffect(() => {
    return () => { kiloCheckController.current?.abort(); kiloCheckController.current = null; };
  }, [isOpen, kiloModel, kiloKey, transport]);

  if (!present) return null;

  const config = {
    ...loadGatewayConfig(),
    omniRouteUrl,
    omniRouteKey,
    omniRouteModel,
    kiloKey,
    kiloModel,
    customProviders,
    transport,
  };
  const selectedKiloModel = kiloModels.find((model) => model.id === kiloModel);
  const kiloRequiresKey = selectedKiloModel
    ? !isFreeModel(selectedKiloModel)
    : kiloModel !== "kilo-auto/free";
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      saveGatewayConfig(config);
      setSaved(true);
      setSaveError("");
    } catch (error) {
      setSaved(false);
      setSaveError(
        error instanceof Error ? error.message : "The browser could not save these settings. Check browser storage and retry.",
      );
    }
  };

  const checkOmniRoute = async () => {
    if (running || omniQuickRunning || omniCheckController.current || !isOpen) return;
    const controller = new AbortController();
    omniCheckController.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    setOmniState("checking");
    setOmniError("");
    try {
      const models = await listOmniRouteModels(config, signal);
      signal.throwIfAborted();
      if (!models.length)
        throw new Error("Gateway responded, but no models were returned.");
      setOmniModels(models);
      if (!omniRouteModel) {
        const freeModels = models.filter(isFreeModel);
        const concreteFreeModels = freeModels.filter(
          (model) => !isAutomaticModel(model),
        );
        setOmniRouteModel(
          currentModelRecommendations(concreteFreeModels)[0]?.id ||
            concreteFreeModels[0]?.id ||
            "",
        );
      }
      setOmniState("connected");
    } catch (error) {
      if (controller.signal.aborted) return;
      setOmniState("error");
      setOmniError(
        error instanceof Error ? error.message : "Connection failed.",
      );
    } finally { if (omniCheckController.current === controller) omniCheckController.current = null; }
  };

  const checkKilo = async () => {
    if (running || kiloCheckController.current) return;
    const controller = new AbortController();
    kiloCheckController.current = controller;
    controller.signal.addEventListener('abort', () => {
      if (kiloCheckController.current === controller) setKiloState('idle');
    }, { once: true });
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
    setKiloState("checking");
    setKiloError("");
    try {
      const models = await listKiloModels(signal, config);
      signal.throwIfAborted();
      if (!models.length)
        throw new Error("Kilo responded, but no models were returned.");
      setKiloModels(models);
      if (config.kiloModel === "kilo-auto/free" && !models.some((model) => model.id === "kilo-auto/free"))
        throw new Error(
          "The current Kilo catalog did not include kilo-auto/free.",
        );
      if (config.kiloModel === "kilo-auto/free") {
        const result = await sendGatewayPrompt('kilo', KILO_CODING_PROBE, config, {
          signal, maxTokens: 1024, firstAnswerTimeoutMs: 5_000, validateResponse: validateKiloCodingProbe,
        });
        signal.throwIfAborted();
        validateKiloCodingProbe(result.text);
        setKiloState("verified");
      } else setKiloState("connected");
    } catch (error) {
      if (controller.signal.aborted) return;
      setKiloState("error");
      setKiloError(
        error instanceof Error ? error.message : "Connection failed.",
      );
    } finally {
      if (kiloCheckController.current === controller) kiloCheckController.current = null;
    }
  };

  const status = (state: ConnectionState) =>
    state === "verified" ? (
      <span className="cw-verified-status">
        <Check size={12} /> Verified response
      </span>
    ) : state === "connected" ? (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-cyan-300">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
        Catalog loaded
      </span>
    ) : state === "checking" ? (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        Checking
      </span>
    ) : state === "error" ? (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-300">
        <CircleAlert className="h-3.5 w-3.5" />
        Needs attention
      </span>
    ) : (
      <span className="text-[11px] text-slate-500">Not checked</span>
    );

  return (
    <div
      data-state={isOpen ? "open" : "closed"}
      className="cw-overlay fixed inset-0 z-50 flex items-center justify-center bg-[#03050a]/80 p-4 backdrop-blur-lg"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-hidden={!isOpen}
        aria-modal="true"
        aria-labelledby="settings-title"
        className="cw-modal cw-settings-dialog flex max-h-[min(90vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#13101c] shadow-[0_32px_120px_rgba(0,0,0,.7)]"
      >
        <header className="flex items-center justify-between border-b border-white/[.07] px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/15 bg-violet-300/[.08] text-violet-200">
              <Settings size={19} />
            </div>
            <div>
              <h2
                id="settings-title"
                className="text-base font-semibold tracking-tight text-white"
              >
                Make it your workspace.
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Connect your models. Find your focus.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-white/[.06] hover:text-white"
          >
            <X size={18} />
          </button>
        </header>
        <div
          className="cw-settings-tabs"
          role="tablist"
          aria-label="Settings sections"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "connections"
                : event.key === "End"
                  ? "appearance"
                  : tab === "connections"
                    ? "appearance"
                    : "connections";
            setTab(next);
            event.currentTarget
              .querySelector<HTMLButtonElement>(`#${next}-tab`)
              ?.focus();
          }}
        >
          <button
            id="connections-tab"
            type="button"
            role="tab"
            aria-selected={tab === "connections"}
            tabIndex={tab === "connections" ? 0 : -1}
            aria-controls="connections-panel"
            onClick={() => setTab("connections")}
          >
            <Radio size={14} /> Connections
          </button>
          <button
            id="appearance-tab"
            type="button"
            role="tab"
            aria-selected={tab === "appearance"}
            tabIndex={tab === "appearance" ? 0 : -1}
            aria-controls="appearance-panel"
            onClick={() => setTab("appearance")}
          >
            <Palette size={14} /> Appearance
          </button>
        </div>
        {tab === "connections" ? (
          <form
            id="connections-panel"
            role="tabpanel"
            aria-labelledby="connections-tab"
            onSubmit={save}
            onChange={() => setSaved(false)}
            className="cw-settings-body space-y-5 overflow-y-auto p-5 sm:p-8"
          >
            <section className="cw-connection-directory" aria-label="Connection shortcuts">
              <div><span className="cw-studio-eyebrow">YOUR INTELLIGENCE, CONNECTED</span><h3>Choose a place to start.</h3><p>Jump to a connection. Model setup and downloads stay under your control.</p></div>
              <nav aria-label="Jump to provider">
                {([
                  { id: 'local', name: 'Local AI', detail: 'On your device', icon: Cpu },
                  { id: 'codex', name: 'Codex', detail: 'GPT subscription', icon: Code2 },
                  { id: 'omniroute', name: 'OmniRoute', detail: 'Model gateway', icon: Radio },
                  { id: 'kilo', name: 'Kilo', detail: 'Free routing', icon: Sparkles },
                  { id: 'custom', name: 'Custom API', detail: 'Your endpoint', icon: Plug },
                ] as const).map(connection => <button key={connection.id} type="button" onClick={() => jumpToConnection(connection.id)}><connection.icon size={17} /><strong>{connection.name}</strong><small>{connection.detail}</small><ArrowRight size={12} /></button>)}
              </nav>
            </section>
            <div id="connection-local" tabIndex={-1} role="group" aria-label="Local model setup" className="cw-connection-destination">
            <LocalModelsPanel active={isOpen} disabled={running || checkingCatalog || omniQuickRunning} providers={customProviders} onUse={(provider, destination) => {
              try {
                const next = [...customProviders.filter(item => item.id !== provider.id), provider];
                if (next.length > 20) throw new Error('Remove an unused custom provider before adding local AI.');
                saveGatewayConfig({ ...config, customProviders: next, transport: 'auto' });
                setCustomProviders(next); setTransport('auto'); setSaveError('');
                onToggleSimulated(false);
                if (destination === 'code') {
                  localStorage.setItem('ahpah_engineering_provider', `custom:${provider.id}`);
                  window.dispatchEvent(new Event('ahpah-engineering-provider-selected'));
                  onConnectLocal();
                } else onAddCustomProvider(provider.id);
              } catch (error) {
                setSaveError(error instanceof Error ? error.message : 'Could not save the local model connection.');
              }
            }} />
            </div>
            <details ref={hostedOptions} className="cw-connection-options">
            <summary>Hosted & custom providers <span>Codex · OmniRoute · Kilo · your API</span></summary>
            <div>
            <div id="connection-codex" tabIndex={-1} role="group" aria-label="Codex connection" className="cw-connection-destination"><CodexConnectionPanel onConnected={onConnectCodex} /></div>
            <section className="cw-auto-setup">
              <div className="cw-auto-heading">
                <span className="cw-icon-tile">
                  <Sparkles size={19} />
                </span>
                <div>
                  <h3>Let the canvas do the setup.</h3>
                  <p>
                    Discover live models, find a working free route, and save
                    it.
                  </p>
                </div>
              </div>
              <div className="cw-auto-actions">
                <button
                  type="button"
                  className="cw-primary-button"
                  disabled={!supportsLocalBridge() || running || checkingCatalog || omniQuickRunning}
                  onClick={() => void runAuto()}
                >
                  {running ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <Zap size={14} />
                  )}{" "}
                  {running
                    ? "Configuring…"
                    : diagnostics.length
                      ? "Run setup again"
                      : "Auto configure"}
                </button>
                {running && (
                  <button
                    type="button"
                    className="cw-soft-button"
                    onClick={() => setupController.current?.abort()}
                  >
                    <Square size={11} /> Stop setup
                  </button>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={autoOnOpen}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setAutoOnOpen(enabled);
                      try {
                        localStorage.setItem(
                          "ahpah_auto_setup_on_open",
                          String(enabled),
                        );
                      } catch {
                        setSaveError("This preference could not be saved.");
                      }
                    }}
                  />
                  Auto setup on first settings open
                </label>
              </div>
              {(running || diagnostics.length > 0) && (
                <div className="cw-setup-progress" aria-live="polite">
                  {(["omniroute", "kilo"] as const).map((provider) => {
                    const progress = setup[provider];
                    return (
                      <div key={provider} className={progress?.phase || ""}>
                        <span>
                          {progress?.phase === "ready" ? (
                            <Check size={14} />
                          ) : progress?.phase === "attention" ? (
                            <CircleAlert size={14} />
                          ) : running ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <Radio size={14} />
                          )}
                        </span>
                        <div>
                          <strong>
                            {provider === "kilo"
                              ? "Kilo Auto Free"
                              : "OmniRoute"}
                            <small>
                              {progress?.phase === "ready"
                                ? "Verified"
                                : progress?.phase === "attention"
                                  ? "Needs attention"
                                  : !running
                                    ? "Stopped"
                                    : progress?.phase === "testing"
                                      ? `Route ${progress.attempt} of ${progress.total}`
                                      : "Discovering"}
                            </small>
                          </strong>
                          <p>
                            {!running &&
                            progress?.phase !== "ready" &&
                            progress?.phase !== "attention"
                              ? "No changes applied to this connection."
                              : progress?.detail || "Waiting to begin…"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {setupMessage && (
                <p className="cw-setup-message" role="status">
                  {setupMessage}
                </p>
              )}
              <p className="cw-auto-note">
                Uses small checks on free text routes. Provider credentials and
                running services may still need your attention.
              </p>
              {diagnostics.length > 0 && (
                <details className="cw-setup-diagnostics">
                  <summary>
                    Setup diagnostics <ChevronDown size={12} />
                  </summary>
                  <ol>
                    {diagnostics.map((entry, index) => (
                      <li key={index}>
                        <span>
                          {entry.provider === "kilo" ? "Kilo" : "OmniRoute"}
                        </span>
                        {entry.detail}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>
            {!supportsLocalBridge() && <div className="cw-hosted-connection-note"><strong>Choose a browser-compatible API</strong><p>This site has no gateway server. Custom HTTPS providers that allow browser access work here. Kilo and local HTTP providers need the local app.</p><a href="https://github.com/ahpah-dev/ahpah-canvas#start-locally" target="_blank" rel="noreferrer">Get the local app <ChevronDown size={12} /></a></div>}
            <div id="connection-omniroute" tabIndex={-1} role="group" aria-label="OmniRoute setup" className="cw-connection-destination mb-5"><OmniRouteSetupButton config={config} disabled={running || checkingCatalog} onRunningChange={setOmniQuickRunning} onConnected={result => {
              setOmniRouteUrl(result.config.omniRouteUrl); setOmniRouteModel(result.config.omniRouteModel);
              setOmniModels(result.models); setOmniState('verified'); setOmniError('');
              setTransport('bridge'); onToggleSimulated(false); onConnectOmniRoute();
            }} /></div>
            <fieldset
              disabled={running || checkingCatalog || omniQuickRunning}
              className="space-y-5"
            >
              <section className="cw-connection-mode">
                <div><strong>Connection mode</strong><p>{gatewayTransport(config) === "direct" ? "API requests go directly from this browser to your provider. The provider must allow browser access (CORS)." : "The local server connects to your API, including providers without browser access."}</p></div>
                <label><span className="sr-only">Connection mode</span><select aria-label="Connection mode" value={supportsLocalBridge() ? transport : "direct"} onChange={(event) => {
                  setTransport(event.target.value as GatewayTransport);
                  setOmniState("idle"); setKiloState("idle");
                }}>
                  {supportsLocalBridge() && <option value="auto">Automatic · local gateway</option>}
                  {supportsLocalBridge() && <option value="bridge">Local gateway</option>}
                  <option value="direct">Browser · direct API</option>
                </select></label>
              </section>
              <section className="cw-provider-credentials rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-300/[.055] to-transparent p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-300/10 text-violet-200">
                      <Radio size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        OmniRoute
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Your local OpenAI compatible gateway
                      </p>
                    </div>
                  </div>
                  {status(omniState)}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field
                      label="Base URL"
                      value={omniRouteUrl}
                      onChange={(value) => {
                        setOmniRouteUrl(value);
                        setOmniState("idle");
                        setOmniError("");
                        setOmniModels([]);
                      }}
                      placeholder="http://localhost:20128/v1"
                    />
                  </div>
                  <Field
                    label="API key · optional"
                    value={omniRouteKey}
                    onChange={(value) => {
                      setOmniRouteKey(value);
                      setOmniState("idle");
                      setOmniError("");
                    }}
                    placeholder="Gateway key, if enabled"
                    secret
                    visible={showOmniKey}
                    toggle={() => setShowOmniKey(!showOmniKey)}
                  />
                  <ModelSelector
                    provider="OmniRoute"
                    models={omniModels}
                    value={omniRouteModel}
                    disabled={running || checkingCatalog || omniQuickRunning}
                    onRefresh={() => void checkOmniRoute()}
                    refreshing={omniState === "checking"}
                    onChange={(value) => {
                      setOmniRouteModel(value);
                      setSaved(false);
                      setOmniState("idle");
                      setOmniError("");
                    }}
                  />
                </div>
                {omniError && (
                  <p className="mt-3 text-xs leading-relaxed text-rose-300">
                    {omniError}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-500">
                    Model list is fetched live from{" "}
                    <code className="text-slate-400">/v1/models</code>.
                  </p>
                  <button
                    type="button"
                    onClick={checkOmniRoute}
                    disabled={omniState === "checking"}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-200/15 bg-violet-200/[.07] px-3.5 py-2 text-xs font-medium text-violet-100 transition hover:bg-violet-200/[.12] disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      className={omniState === "checking" ? "animate-spin" : ""}
                    />
                    Load live models
                  </button>
                </div>
              </section>

              <section id="connection-kilo" tabIndex={-1} aria-label="Kilo connection" className="cw-connection-destination rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[.05] to-transparent p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
                      <Zap size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Kilo AI Gateway
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {kiloModel === "kilo-auto/free"
                          ? "Auto Free routes to Kilo’s current free models"
                          : "Direct model selection from Kilo’s live catalog"}
                      </p>
                    </div>
                  </div>
                  {status(kiloState)}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={
                      kiloRequiresKey
                        ? "Kilo API key · required for this route"
                        : "Kilo API key · optional for free routes"
                    }
                    value={kiloKey}
                    onChange={(value) => {
                      setKiloKey(value);
                      setKiloState("idle");
                      setKiloError("");
                    }}
                    placeholder={
                      kiloRequiresKey
                        ? "Enter your Kilo key for this model"
                        : "Paste a key for account tracking"
                    }
                    secret
                    visible={showKiloKey}
                    toggle={() => setShowKiloKey(!showKiloKey)}
                  />
                  <ModelSelector
                    provider="Kilo"
                    models={kiloModels}
                    value={kiloModel}
                    disabled={running || checkingCatalog || omniQuickRunning}
                    onChange={(value) => {
                      setKiloModel(value);
                      setSaved(false);
                      setKiloState("idle");
                      setKiloError("");
                    }}
                  />
                </div>
                {kiloError && (
                  <p className="mt-3 text-xs leading-relaxed text-rose-300">
                    {kiloError}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-500">
                    {kiloModel === "kilo-auto/free"
                      ? "Keeps a verified free route during each coding run and switches routes if actions repeat."
                      : "Requests use this exact model ID, without Auto Free routing."}
                  </p>
                  <button
                    type="button"
                    onClick={checkKilo}
                    disabled={kiloState === "checking" || running}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/15 bg-cyan-200/[.07] px-3.5 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-200/[.12] disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      className={kiloState === "checking" ? "animate-spin" : ""}
                    />
                    {kiloModel === "kilo-auto/free" ? "Verify Auto Free" : "Check Kilo catalog"}
                  </button>
                </div>
                {!kiloKey && !kiloRequiresKey && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-cyan-200/80">
                    <KeyRound size={12} />
                    Kilo Auto Free works without a key. Add one if you want
                    requests associated with your account.
                  </p>
                )}
              </section>

              <div id="connection-custom" tabIndex={-1} role="group" aria-label="Custom API providers" className="cw-connection-destination"><CustomProvidersPanel providers={customProviders} config={config} disabled={running || checkingCatalog || omniQuickRunning} onChange={(next) => { setCustomProviders(next); setSaved(false); }} onUse={(provider) => {
                try {
                  saveGatewayConfig(config);
                  setSaveError("");
                  onAddCustomProvider(provider.id);
                } catch (error) {
                  setSaveError(error instanceof Error ? error.message : "Could not save this provider.");
                }
              }} /></div>
              <section className="flex items-center justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 sm:px-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-violet-200">
                    <Sparkles size={17} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100">
                      Demo simulation
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      Use sample responses without contacting either gateway.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Demo simulation"
                  aria-checked={isSimulated}
                  onClick={() => onToggleSimulated(!isSimulated)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${isSimulated ? "bg-violet-500" : "bg-slate-700"}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${isSimulated ? "left-6" : "left-1"}`}
                  />
                </button>
              </section>
            </fieldset>
            </div>
            </details>
            {saveError && (
              <p role="alert" className="cw-inline-error">
                {saveError}
              </p>
            )}
          </form>
        ) : (
          <div
            id="appearance-panel"
            role="tabpanel"
            aria-labelledby="appearance-tab"
            className="cw-settings-appearance"
          >
            <AppearancePanel />
          </div>
        )}
        <footer className="cw-settings-footer">
          <span><Activity size={13} />{tab === 'connections' ? 'Credentials stay in this browser.' : 'Appearance changes save automatically.'}</span>
          <div>{tab === 'connections' && saved && <span className="cw-settings-saved" role="status"><Check size={13} />Saved</span>}<button type="button" className="cw-soft-button" onClick={onClose}>{tab === 'connections' ? 'Close' : 'Done'}</button>{tab === 'connections' && <button type="submit" form="connections-panel" className="cw-primary-button" disabled={running || checkingCatalog || omniQuickRunning}>Save changes<Check size={13} /></button>}</div>
        </footer>
      </div>
    </div>
  );
};
