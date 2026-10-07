import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Command,
  CornerDownLeft,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  X,
} from "lucide-react";
import type { CanvasCard, VoiceDispatchEvent } from "../../types/canvas";
import type { EngineeringProvider } from '../../types/engineering';
import { cardName, isBusy } from "../../utils/cardPresentation";
import { resolveCanvasCommand, type CanvasControlCommand } from '../../utils/canvasCommands';
import './canvasCommands.css';
interface VoiceBarProps {
  cards: CanvasCard[];
  selectedCardId: string | null;
  onDispatch: (event: VoiceDispatchEvent) => void;
  onDirectPrompt: (id: string, prompt: string) => void;
  providers: EngineeringProvider[];
  onCommand: (command: CanvasControlCommand) => string;
}
export function VoiceBar({
  cards,
  selectedCardId,
  onDispatch,
  onDirectPrompt,
  providers,
  onCommand,
}: VoiceBarProps) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("auto");
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const recognition = useRef<any>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agents = cards.filter((card) => card.type === "agent");
  const effective = target !== 'auto' && target !== 'all' ? agents.find(card => card.id === target) :
    agents.find((card) => card.id === selectedCardId) ||
    agents[0];
  const command = resolveCanvasCommand(text, cards, providers);
  const addressed = command?.kind === 'prompt' ? agents.find(card => card.id === command.cardId) : undefined;
  const supported =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  const busy = command && command.kind !== 'prompt' ? false : addressed ? isBusy(addressed) :
    target === "all"
      ? agents.length > 0 && agents.every(isBusy)
      : effective
        ? isBusy(effective)
        : false;
  const canSend = !!text.trim() && !listening && !busy && (command
    ? command.kind !== 'invalid' && (command.kind !== 'prompt' || !!command.prompt)
    : agents.length > 0 && (target === 'all' || !!effective));
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k' || document.querySelector('[aria-modal="true"]:not([aria-hidden="true"])')) return;
      event.preventDefault();
      setHelpOpen(true);
      input.current?.focus();
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!helpOpen) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setHelpOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [helpOpen]);
  useEffect(() => {
    if (!supported) return;
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const instance = new Recognition();
    instance.continuous = false;
    instance.interimResults = true;
    instance.lang = "en-US";
    instance.onresult = (event: any) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index++)
        transcript += event.results[index][0].transcript;
      setText(transcript);
    };
    instance.onend = () => setListening(false);
    instance.onerror = (event: any) => {
      setListening(false);
      setFeedback(
        event.error === "not-allowed"
          ? "Microphone permission was denied. You can type your prompt."
          : "Voice input ended. You can type your prompt.",
      );
    };
    recognition.current = instance;
    return () => {
      instance.onresult = null;
      instance.onend = null;
      instance.onerror = null;
      instance.abort();
      recognition.current = null;
    };
  }, [supported]);
  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );
  const notify = (message: string) => {
    setFeedback(message);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(""), 5000);
  };
  const send = () => {
    if (!canSend) return;
    if (command) {
      if (command.kind === 'invalid') return;
      if (command.kind === 'prompt') {
        onDirectPrompt(command.cardId, command.prompt);
        notify(`${command.label}.`);
      } else notify(onCommand(command));
      setText('');
      setHelpOpen(false);
      return;
    }
    if (!agents.length) {
      notify("Open a coding agent with /open Codex or the Commands menu.");
      return;
    }
    if (target === "all") {
      onDispatch({
        action: "run_all",
        transcript: text.trim(),
        parameters: text.trim(),
      });
      notify("Sent to available agents.");
    } else if (effective) {
      onDirectPrompt(effective.id, text.trim());
      notify(`Sent to ${cardName(effective)}.`);
    }
    setText("");
    setHelpOpen(false);
  };
  const prepare = (value: string) => {
    setText(value);
    setHelpOpen(false);
    input.current?.focus();
  };
  const toggleVoice = () => {
    if (!recognition.current) {
      notify("Voice input is not supported by this browser.");
      return;
    }
    if (listening) {
      recognition.current.stop();
      setListening(false);
    } else {
      try {
        recognition.current.start();
        setListening(true);
      } catch {
        notify("Voice input could not start. Try again or type your prompt.");
      }
    }
  };
  return (
    <div className="cw-command-wrap" ref={root} onKeyDown={event => {
      if (event.key === 'Escape' && helpOpen) { event.preventDefault(); event.stopPropagation(); setHelpOpen(false); input.current?.focus(); }
    }}>
      {helpOpen && <section className="cw-command-guide" role="dialog" aria-label="Canvas commands" id="cw-command-guide">
        <header><div><Command size={15} /><strong>Your canvas, by command.</strong></div><button type="button" aria-label="Close canvas commands" onClick={() => { setHelpOpen(false); input.current?.focus(); }}><X size={15} /></button></header>
        <p>Type or dictate. Review the action, then press Enter. Opening cards and focusing agents use no model tokens.</p>
        <div className="cw-command-guide-actions"><button type="button" onClick={() => prepare('/open Codex')}>Open Codex<ArrowUpRight size={12} /></button><button type="button" onClick={() => prepare('/open preview')}>Open preview<ArrowUpRight size={12} /></button><button type="button" onClick={() => prepare('/open notes')}>Add notes<ArrowUpRight size={12} /></button><button type="button" onClick={() => prepare('/settings')}>Connect models<ArrowUpRight size={12} /></button></div>
        {providers.length > 0 && <div className="cw-command-guide-section"><span>YOUR CONFIGURED ROUTES</span>{providers.map(provider => <button type="button" key={provider.id} onClick={() => prepare(`/open ${provider.id}`)}><Radio size={13} /><span><strong>{provider.label}</strong><small>{provider.model}</small></span><ArrowUpRight size={12} /></button>)}</div>}
        {agents.length > 0 && <div className="cw-command-guide-section"><span>ADDRESS AN AGENT</span>{agents.map(card => <div className="cw-command-agent-row" key={card.id}><button type="button" onClick={() => prepare(`@${cardName(card)} `)}><Command size={13} /><span><strong>@{cardName(card)}</strong><small>{isBusy(card) ? 'Working · your task stays in the input' : 'Prepare a task for this agent'}</small></span></button><button type="button" aria-label={`Prepare focus command for ${cardName(card)}`} onClick={() => prepare(`/focus ${card.id}`)}>Focus<ArrowUpRight size={11} /></button></div>)}</div>}
        <footer><span>Plain prompts use your selected target.</span><kbd>Ctrl / ⌘ K</kbd></footer>
      </section>}
      {command && <div className={`cw-command-preview${command.kind === 'invalid' ? ' is-invalid' : ''}`} id="cw-command-preview" aria-live="polite"><span className="cw-command-preview-icon">{command.kind === 'prompt' ? <Radio size={15} /> : <Command size={15} />}</span><div><strong>{command.label}</strong><small>{busy ? 'This agent is working. Your task stays here until it is ready.' : command.detail}</small></div><span className="cw-command-preview-badge">{command.kind === 'prompt' ? 'ONE AGENT' : command.kind === 'invalid' ? 'NOT SENT' : 'NO TOKENS'}</span></div>}
      {feedback && (
        <div className="cw-command-feedback" role="status">
          <Sparkles size={12} />
          {feedback}
          <button aria-label="Dismiss feedback" onClick={() => setFeedback("")}>
            <X size={12} />
          </button>
        </div>
      )}
      <form
        className="cw-command-bar"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <button type="button" className="cw-command-symbol" aria-label="Show canvas commands" aria-expanded={helpOpen} aria-controls="cw-command-guide" onClick={() => setHelpOpen(value => !value)} title="Canvas commands (Ctrl / ⌘ K)">
          <Command size={15} />
        </button>
        <label className="cw-command-target">
          <Radio size={13} />
          <select
            aria-label="Prompt target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="auto">
              {effective ? cardName(effective) : "Open an agent"}
            </option>
            <option value="all">All available agents</option>
            {agents.map((card) => (
              <option key={card.id} value={card.id}>
                {cardName(card)}
                {card.parentId ? " · Worker" : ""}
              </option>
            ))}
          </select>
          <ChevronDown size={11} />
        </label>
        <input
          ref={input}
          aria-label="Workspace prompt"
          aria-describedby={command ? 'cw-command-preview' : 'cw-command-caption'}
          aria-invalid={command?.kind === 'invalid' || undefined}
          maxLength={6000}
          placeholder={
            listening
              ? "Listening… review your words before sending"
              : busy
                ? "Agent is responding…"
                : "Describe a task, @an agent, or /open Codex…"
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={event => {
            if (helpOpen && event.key === 'ArrowDown') { event.preventDefault(); root.current?.querySelector<HTMLButtonElement>('.cw-command-guide-actions button')?.focus(); }
          }}
        />
        <button
          type="button"
          className={`cw-voice-toggle ${listening ? "listening" : ""}`}
          onClick={toggleVoice}
          aria-label={
            listening ? "Stop voice dictation" : "Start voice dictation"
          }
          title={
            supported
              ? "Dictate a prompt"
              : "Voice input needs a browser with speech recognition"
          }
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          className="cw-send-button"
          type="submit"
          disabled={!canSend}
          aria-label={command && command.kind !== 'prompt' ? 'Run workspace command' : 'Send workspace prompt'}
        >
          <ArrowUp size={17} />
        </button>
      </form>
      <div className="cw-command-caption" id="cw-command-caption">
        <span>
          {listening
            ? "Listening · review before sending"
            : busy
              ? "Your agent is responding"
              : "Use @names to direct a task · /open to launch"}
        </span>
        <span>
          <button type="button" onClick={() => setHelpOpen(value => !value)} aria-expanded={helpOpen} aria-controls="cw-command-guide">Commands</button><span>{command && command.kind !== 'prompt' ? 'Enter to run' : 'Enter to send'}<CornerDownLeft size={10} /></span>
        </span>
      </div>
    </div>
  );
}
