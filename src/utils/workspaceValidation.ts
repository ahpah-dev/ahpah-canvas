import type { AgentType, CanvasCard, Connection, MemoryItem } from "../types/canvas";
import { AGENT_SPECIALIZATIONS, hasIdentityControlCharacters } from './agentIdentity.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const hasId = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();
const optionalEnum = (value: unknown, allowed: readonly string[]) =>
  value === undefined || (typeof value === "string" && allowed.includes(value));
const selectFields = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(value, field))
      .map((field) => [field, value[field]]),
  );
const agentTypes: AgentType[] = [
  "omniroute", "9router", "kilo", "deepseek", "qwen", "claude", "codex", "gemini",
  "aider", "cursor", "grok", "ollama", "custom",
];
const cardFields = [
  "id", "type", "x", "y", "width", "height", "title", "agentType",
  "providerId", "providerName", "status", "role", "history", "currentPrompt",
  "tokensUsed", "cpuPercent", "lastAction", "parentId", "pinned", "minimized",
  "browserUrl", "browserDevice", "noteContent", "cliCommand", "routedModel",
  "modelSource", "legacyMigrated", "compressionSavedPercent", "pendingCommands",
  "agentName", "specialization", "agentInstructions",
] satisfies (keyof CanvasCard)[];
const lineFields = ["id", "text", "type", "timestamp"];

export function validateCards(value: unknown): CanvasCard[] {
  if (!Array.isArray(value))
    throw new Error("Workspace cards must be an array.");
  const ids = new Set<string>();
  for (const card of value) {
    if (
      !isRecord(card) ||
      !hasId(card.id) ||
      ids.has(card.id) ||
      typeof card.type !== "string" ||
      !["agent", "note", "browser", "terminal"].includes(card.type) ||
      typeof card.title !== "string" ||
      !Array.isArray(card.history) ||
      !["x", "y", "width", "height", "tokensUsed", "cpuPercent"].every(
        (key) => typeof card[key] === "number" && Number.isFinite(card[key]),
      ) ||
      Number(card.width) < 100 ||
      Number(card.height) < 100 ||
      Number(card.tokensUsed) < 0 ||
      Number(card.cpuPercent) < 0 ||
      !optionalEnum(card.agentType, agentTypes) ||
      !optionalEnum(card.specialization, AGENT_SPECIALIZATIONS.map(item => item.id)) ||
      (card.agentName !== undefined && (typeof card.agentName !== 'string' || !card.agentName.trim() || card.agentName.length > 60 || hasIdentityControlCharacters(card.agentName))) ||
      (card.agentInstructions !== undefined && (typeof card.agentInstructions !== 'string' || card.agentInstructions.length > 4000 || card.agentInstructions.includes('\0'))) ||
      (card.specialization === 'custom' && (typeof card.role !== 'string' || !card.role.trim() || card.role.length > 80 || hasIdentityControlCharacters(card.role))) ||
      !optionalEnum(card.status, ["idle", "working", "thinking", "approval_required", "tests_passing", "error"]) ||
      !optionalEnum(card.browserDevice, ["desktop", "mobile"]) ||
      !optionalEnum(card.modelSource, ["live"]) ||
      ["pinned", "minimized", "legacyMigrated"].some(
        (key) => card[key] !== undefined && typeof card[key] !== "boolean",
      ) ||
      (card.compressionSavedPercent !== undefined &&
        (typeof card.compressionSavedPercent !== "number" ||
          !Number.isFinite(card.compressionSavedPercent) ||
          card.compressionSavedPercent < 0 || card.compressionSavedPercent > 100)) ||
      [
        "noteContent",
        "browserUrl",
        "routedModel",
        "role",
        "currentPrompt",
        "lastAction",
        "providerId",
        "providerName",
        "parentId",
        "cliCommand",
      ].some(
        (key) => card[key] !== undefined && typeof card[key] !== "string",
      ) ||
      (card.pendingCommands !== undefined && (!Array.isArray(card.pendingCommands) || card.pendingCommands.length > 10 || card.pendingCommands.some(command => typeof command !== 'string' || command.length > 240))) ||
      card.history.some(
        (line) =>
          !isRecord(line) ||
          !hasId(line.id) ||
          typeof line.text !== "string" ||
          (line.timestamp !== undefined &&
            typeof line.timestamp !== "string") ||
          typeof line.type !== "string" ||
          ![
            "input",
            "output",
            "system",
            "error",
            "success",
            "plan",
            "diff",
            "route",
            "tool",
          ].includes(line.type),
      )
    ) {
      throw new Error(
        "Workspace contains an invalid card or duplicate card ID.",
      );
    }
    const lineIds = new Set<string>();
    for (const line of card.history) {
      if (lineIds.has(line.id))
        throw new Error("Workspace contains duplicate history line IDs.");
      lineIds.add(line.id);
    }
    ids.add(card.id);
  }
  // Unknown properties are not workspace data. In particular, imported provider
  // credentials must never travel into later workspace exports.
  return value.map((card) => ({
    ...selectFields(card, cardFields),
    history: card.history.map((line: Record<string, unknown>) => selectFields(line, lineFields)),
  })) as CanvasCard[];
}

export function validateWorkspace(value: unknown): {
  cards: CanvasCard[];
  connections: Connection[];
  memory: MemoryItem[];
} {
  if (!isRecord(value)) throw new Error("Invalid workspace file.");
  const cards = validateCards(value.cards);
  const connections = value.connections ?? [];
  const memory = value.memory ?? [];
  const cardIds = new Set(cards.map((card) => card.id));
  const connectionIds = new Set<string>();
  if (
    !Array.isArray(connections) ||
    connections.some((connection) => {
      if (
        !isRecord(connection) || !hasId(connection.id) ||
        connectionIds.has(connection.id) ||
        typeof connection.fromCardId !== "string" ||
        typeof connection.toCardId !== "string" ||
        !cardIds.has(connection.fromCardId) || !cardIds.has(connection.toCardId) ||
        (connection.label !== undefined && typeof connection.label !== "string") ||
        (connection.active !== undefined && typeof connection.active !== "boolean")
      ) return true;
      connectionIds.add(connection.id);
      return false;
    })
  )
    throw new Error("Workspace contains an invalid connection.");
  const memoryIds = new Set<string>();
  if (
    !Array.isArray(memory) ||
    memory.some((item) => {
      if (
        !isRecord(item) || !hasId(item.id) || memoryIds.has(item.id) ||
        !["id", "key", "value", "author", "timestamp"].every(
          (key) => typeof item[key] === "string",
        ) ||
        typeof item.type !== "string" ||
        !["fact", "decision", "changelog"].includes(item.type)
      ) return true;
      memoryIds.add(item.id);
      return false;
    })
  )
    throw new Error("Workspace contains an invalid memory item.");
  return {
    cards,
    connections: connections.map((connection) => ({
      id: connection.id,
      fromCardId: connection.fromCardId,
      toCardId: connection.toCardId,
      ...(Object.hasOwn(connection, "label") ? { label: connection.label } : {}),
      ...(Object.hasOwn(connection, "active") ? { active: connection.active } : {}),
    })),
    memory: memory.map((item) => ({
      id: item.id,
      key: item.key,
      value: item.value,
      author: item.author,
      timestamp: item.timestamp,
      type: item.type,
    })),
  };
}
