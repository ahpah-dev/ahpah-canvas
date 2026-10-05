import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Code2, LoaderCircle, RefreshCw } from "lucide-react";
import { cancelCodexLogin, codexModel, connectCodex, getCodexStatus, selectCodexModel, type CodexStatus } from "../../utils/codexConnection";
import { supportsLocalBridge } from "../../utils/gateways";

export function CodexConnectionPanel({ onConnected }: { onConnected: () => void }) {
  const [status, setStatus] = useState<CodexStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState(codexModel);
  const alive = useRef(true);
  const awaiting = useRef(false);
  const callback = useRef(onConnected);
  useEffect(() => { callback.current = onConnected; }, [onConnected]);
  const apply = useCallback((next: CodexStatus) => {
    if (!alive.current) return;
    setStatus(previous => next.pending && !next.authUrl ? { ...next, authUrl: previous?.authUrl } : next); setError(next.error || "");
    if (next.connected && next.models.length) {
      const saved = codexModel();
      const selected = next.models.some(item => item.id === saved) ? saved : (next.models.find(item => item.isDefault) || next.models[0]).id;
      if (selected !== saved) selectCodexModel(selected);
      setModel(selected);
      if (awaiting.current) { awaiting.current = false; callback.current(); }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!supportsLocalBridge()) return () => { alive.current = false; };
    const controller = new AbortController();
    void getCodexStatus(controller.signal).then(apply).catch(() => { if (alive.current && !controller.signal.aborted) setError("Could not reach Codex. Click Connect to retry setup."); });
    return () => { alive.current = false; controller.abort(); };
  }, [apply]);
  useEffect(() => {
    if (!status?.pending) return;
    const controller = new AbortController();
    let polling = false;
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void getCodexStatus(controller.signal).then(apply).catch(() => { if (!controller.signal.aborted) setError("Sign-in status is unavailable. Try refreshing the connection."); }).finally(() => { polling = false; });
    }, 2000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [status?.pending, apply]);
  const connect = async () => {
    setBusy(true); setError(""); awaiting.current = true;
    // Reserve the tab during the click so asynchronous sign-in isn't blocked as a popup.
    const popup = status?.connected ? null : window.open("about:blank", "ahpah-codex-sign-in");
    try {
      const next = await connectCodex();
      if (next.authUrl) {
        const url = new URL(next.authUrl);
        if (url.protocol !== "https:" || url.hostname !== "auth.openai.com") throw new Error("Unexpected Codex sign-in URL.");
        if (popup) { popup.opener = null; popup.location.href = url.href; }
      } else popup?.close();
      apply(next);
    } catch (reason) {
      popup?.close(); awaiting.current = false;
      if (alive.current) setError(reason instanceof Error ? reason.message : "Could not connect Codex.");
    } finally { if (alive.current) setBusy(false); }
  };
  return <section className="cw-codex-connection">
    <div className="cw-auto-heading">
      <span className="cw-icon-tile"><Code2 size={20} /></span>
      <div><span className="cw-codex-eyebrow">YOUR CHATGPT PLAN</span><h3>Codex, connected to your canvas.</h3><p>Use your ChatGPT sign-in for coding in Canvas and Code. No API key to paste.</p></div>
      {status?.connected && <span className="cw-codex-status"><Check size={13} /> Connected{status.plan ? ` · ${status.plan}` : ""}</span>}
    </div>
    {supportsLocalBridge() ? <>
      <div className="cw-auto-actions">
        <button type="button" className="cw-primary-button" disabled={busy || status?.pending} onClick={() => void connect()}>
          {busy || status?.pending ? <LoaderCircle size={15} className="animate-spin" /> : <Code2 size={15} />}
          {busy ? "Setting up Codex…" : status?.pending ? "Waiting for ChatGPT sign-in…" : status?.connected ? "Use Codex in Canvas" : "Connect with ChatGPT"}
        </button>
        {status?.pending ? <button type="button" className="cw-secondary-button" onClick={() => { awaiting.current = false; void cancelCodexLogin().then(() => getCodexStatus()).then(apply).catch(() => setError("Could not cancel sign-in. Try refreshing.")); }}>Cancel sign-in</button>
          : <button type="button" className="cw-secondary-button" disabled={busy} onClick={() => { setBusy(true); void getCodexStatus().then(apply).catch(() => setError("Could not refresh Codex. Try Connect again.")).finally(() => { if (alive.current) setBusy(false); }); }}><RefreshCw size={14} /> Refresh</button>}
      </div>
      {status?.pending && status.authUrl && <a className="cw-codex-sign-in" href={status.authUrl} target="_blank" rel="noopener noreferrer">Open ChatGPT sign-in <ArrowUpRight size={14} /></a>}
      {status?.connected && <label className="cw-codex-model">Codex model<select value={model} onChange={event => { setModel(event.target.value); selectCodexModel(event.target.value); }}>{status.models.map(item => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " · Codex default" : ""}</option>)}</select><small>Current catalog from Codex. Your plan and usage limits determine model access.</small></label>}
      <p className="cw-codex-note">{status?.installed ? "Reuses your local Codex sign-in. Credentials stay with Codex on this PC." : "Connect detects Codex or installs the official CLI, then opens ChatGPT sign-in."}</p>
      {error && <p className="cw-codex-error" role="alert">{error}</p>}
    </> : <p className="cw-codex-note">Start the app on your PC with <strong>Start AhPah.bat</strong>, then connect here. The GitHub Pages site cannot run local Codex.</p>}
  </section>;
}
