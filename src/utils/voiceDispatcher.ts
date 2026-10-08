import { AgentType, VoiceDispatchEvent } from '../types/canvas';

export function parseVoiceTranscript(transcript: string): VoiceDispatchEvent {
  const clean = transcript.trim().toLowerCase();

  // Pattern: "one click setup" or "1 click setup" or "setup free models"
  if (clean.includes('setup') || clean.includes('one click') || clean.includes('1 click') || clean.includes('connect free')) {
    return {
      transcript,
      action: 'setup',
      parameters: '1-Click Free Setup',
    };
  }

  // Pattern: "open [agent]" or "spawn [agent]" or "launch [agent]"
  const openMatch = clean.match(/(?:open|spawn|launch|add|start)\s+(9router|omniroute|kilo|kilo\s*code|deepseek|qwen|claude|codex|gemini|aider|cursor|grok|ollama|terminal|browser|preview|notes|note)/i);
  if (openMatch) {
    let rawTarget = openMatch[1].replace(/\s+/g, '');
    if (rawTarget === 'kilocode') rawTarget = 'kilo';
    if (rawTarget === 'preview') rawTarget = 'browser';
    if (rawTarget === 'note') rawTarget = 'notes';
    return {
      transcript,
      action: 'spawn',
      targetAgent: rawTarget,
      parameters: rawTarget,
    };
  }

  // Pattern: "tell [agent] to [prompt]" or "ask [agent] [prompt]" or "[agent] [prompt]"
  const tellMatch = clean.match(/(?:tell|ask|command|direct)\s+(9router|omniroute|kilo|kilo\s*code|deepseek|qwen|claude|codex|gemini|aider|cursor|grok|ollama)\s+(?:to\s+)?(.+)/i);
  if (tellMatch) {
    let rawTarget = tellMatch[1].replace(/\s+/g, '');
    if (rawTarget === 'kilocode') rawTarget = 'kilo';
    return {
      transcript,
      action: 'prompt',
      targetAgent: rawTarget,
      parameters: tellMatch[2],
    };
  }

  // Pattern: "run tests" or "test all"
  if (clean.includes('run test') || clean.includes('test all') || clean.includes('verify')) {
    return {
      transcript,
      action: 'run_all',
      parameters: 'Run comprehensive test verification suite',
    };
  }

  // Pattern: "clear"
  if (clean.includes('clear')) {
    return {
      transcript,
      action: 'clear',
    };
  }

  // Direct address: "kilo refactor auth" or "omniroute compress"
  const agentKeys: AgentType[] = ['9router', 'omniroute', 'kilo', 'deepseek', 'qwen', 'claude', 'codex', 'gemini', 'aider', 'cursor', 'grok', 'ollama'];
  const directAgent = agentKeys.find(a => clean.startsWith(a + ' '));
  if (directAgent) {
    return {
      transcript,
      action: 'prompt',
      targetAgent: directAgent,
      parameters: clean.replace(directAgent, '').trim(),
    };
  }

  return {
    transcript,
    action: 'unknown',
    parameters: transcript,
  };
}
