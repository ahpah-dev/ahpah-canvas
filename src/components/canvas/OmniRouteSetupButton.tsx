import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ListChecks, LoaderCircle, Radio, Square, Sparkles, Zap } from 'lucide-react';
import { loadGatewayConfig, supportsLocalBridge, type GatewayConfig } from '../../utils/gateways';
import { oneClickOmniRouteSetup, type OmniRouteSetupResult } from '../../utils/omniRouteSetup';

export function OmniRouteSetupButton({ config, onConnected, onOpenSettings, disabled, onRunningChange }: {
  config?: GatewayConfig;
  onConnected: (result: OmniRouteSetupResult) => void;
  onOpenSettings?: () => void;
  disabled?: boolean;
  onRunningChange?: (running: boolean) => void;
}) {
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState('Install if needed, start locally, verify a live model, and save your connection.');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const local = supportsLocalBridge();
  const dashboardLink = (path: string) => {
    try {
      const url = new URL(config?.omniRouteUrl || loadGatewayConfig().omniRouteUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP dashboard URL.');
      url.pathname = `${url.pathname.replace(/\/v1\/?$/, '').replace(/\/$/, '')}${path}` || path;
      url.search = '';
      url.hash = '';
      return url.href;
    } catch { return `http://localhost:20128${path}`; }
  };
  const connect = async () => {
    if (controller.current || disabled) return;
    const active = new AbortController(); controller.current = active;
    setRunning(true); onRunningChange?.(true); setError(''); setDetail('Checking your local gateway…');
    try {
      const result = await oneClickOmniRouteSetup(config || loadGatewayConfig(), AbortSignal.any([active.signal, AbortSignal.timeout(6 * 60_000)]), progress => setDetail(progress.detail));
      if (!active.signal.aborted) onConnected(result);
    } catch (failure) {
      if (active.signal.aborted) setDetail('Setup stopped. Your saved settings and completed installation have been kept.');
      else setError(failure instanceof Error ? failure.message : 'OmniRoute setup failed. Retry setup.');
    } finally { if (controller.current === active) { controller.current = null; setRunning(false); onRunningChange?.(false); } }
  };
  return <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[.045] p-4">
    <div className="flex items-start gap-3"><Radio size={18} className="mt-0.5 shrink-0 text-violet-200" /><div className="min-w-0 flex-1">
      <strong className="text-xs font-semibold text-white">One-click OmniRoute setup</strong>
      <p role="status" aria-live="polite" className="mt-1.5 text-xs leading-relaxed text-slate-400">{local ? detail : 'Launch Start AhPah.bat on your PC to install and connect OmniRoute.'}</p>
    </div></div>
    {error && <div role="alert" className="mt-3 text-xs leading-relaxed text-rose-300">{error}<div className="mt-2 flex flex-wrap gap-3">
      <a href={dashboardLink('/dashboard/providers')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-200">Open OmniRoute Providers <ArrowUpRight size={12} /></a>
      {onOpenSettings && <button type="button" onClick={onOpenSettings} className="text-violet-200">Connection settings</button>}
    </div></div>}
    <div className="mt-3 rounded-xl border border-white/[.07] bg-black/15 p-3.5">
      <div className="flex items-start gap-2.5">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-violet-200" />
        <div className="min-w-0">
          <strong className="text-[11px] font-semibold text-slate-100">Get stronger free coding models</strong>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">OmniRoute routes accounts you connect; it does not unlock paid model access. Add free-tier providers there. Setup verifies actual free model routes from the live catalog and saves a route only after its coding check succeeds.</p>
        </div>
      </div>
      <ol className="mt-2.5 list-decimal space-y-1.5 pl-6 text-[11px] leading-relaxed text-slate-400 marker:text-violet-300">
        <li>Open <strong className="text-slate-200">Free Provider Rankings</strong> in OmniRoute and choose <strong className="text-slate-200">Coding</strong> to see its current top free routes.</li>
        <li>Go to <strong className="text-slate-200">Providers → Add Provider</strong>, choose a ranked provider, check its prerequisites and quota, then complete any required sign-in or API-key setup. OpenCode Free uses no account key; Canvas supplies its coding tools.</li>
        <li>Return here and click <strong className="text-slate-200">Set up OmniRoute</strong>. It checks concrete routes marked free and can skip a provider whose connection is unavailable.</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/[.06] pt-2.5">
        <a href={dashboardLink('/dashboard/free-provider-rankings')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-violet-200 hover:text-violet-100">Coding free rankings <ArrowUpRight size={11} /></a>
        <a href={dashboardLink('/dashboard/providers')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-violet-200 hover:text-violet-100"><ListChecks size={11} /> Manage providers <ArrowUpRight size={11} /></a>
        <a href="https://github.com/diegosouzapw/OmniRoute/wiki/Free-Provider-Rankings" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">Setup guide <ArrowUpRight size={11} /></a>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Free plans have provider-set quotas and may require account sign-in. The model list changes as providers update.</p>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={!local || running || disabled} onClick={() => void connect()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50">
        {running ? <LoaderCircle size={14} className="animate-spin" /> : <Zap size={14} />}{running ? 'Setting up OmniRoute…' : 'Set up OmniRoute'}
      </button>
      {running && <button type="button" onClick={() => controller.current?.abort()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/[.05]"><Square size={11} />Stop</button>}
    </div>
  </div>;
}
