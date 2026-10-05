import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Command,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  X,
} from "lucide-react";
import type { CanvasCard, VoiceDispatchEvent } from "../../types/canvas";
import { cardName, isBusy } from "../../utils/cardPresentation";
interface VoiceBarProps {
  cards: CanvasCard[];
  selectedCardId: string | null;
  onDispatch: (event: VoiceDispatchEvent) => void;
  onDirectPrompt: (id: string, prompt: string) => void;
}
export function VoiceBar({
  cards,
  selectedCardId,
  onDispatch,
  onDirectPrompt,
}: VoiceBarProps) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("auto");
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState("");
  const recognition = useRef<any>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agents = cards.filter((card) => card.type === "agent");
  const effective =
    agents.find((card) => card.id === target) ||
    agents.find((card) => card.id === selectedCardId) ||
    agents[0];
  const supported =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  const busy =
    target === "all"
      ? agents.length > 0 && agents.every(isBusy)
      : effective
        ? isBusy(effective)
        : false;
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
    if (!text.trim() || busy) return;
    if (!agents.length) {
      notify("Add an agent card to start a conversation.");
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
    <div className="cw-command-wrap">
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
        <span className="cw-command-symbol">
          <Command size={15} />
        </span>
        <label className="cw-command-target">
          <Radio size={13} />
          <select
            aria-label="Prompt target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="auto">
              {effective ? cardName(effective) : "Select an agent"}
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
          aria-label="Workspace prompt"
          placeholder={
            listening
              ? "Listening… review your words before sending"
              : busy
                ? "Agent is responding…"
                : "Plan a change, review code, or investigate a bug…"
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
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
          disabled={!text.trim() || busy || !agents.length}
          aria-label="Send workspace prompt"
        >
          <ArrowUp size={17} />
        </button>
      </form>
      <div className="cw-command-caption">
        <span>
          {listening
            ? "Listening · review before sending"
            : busy
              ? "Your agent is responding"
              : "Discuss here · edit project files in Code"}
        </span>
        <span>
          Enter to send <kbd>↵</kbd>
        </span>
      </div>
    </div>
  );
}
