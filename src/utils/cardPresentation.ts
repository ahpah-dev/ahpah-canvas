import type { CanvasCard } from "../types/canvas";

export const isBusy = (card: CanvasCard) =>
  card.status === "thinking" || card.status === "working";
export const cardName = (card: Pick<CanvasCard, 'agentName' | 'agentType' | 'title'>) =>
  card.agentName?.trim() || (card.agentType === "kilo"
    ? "Kilo Gateway"
    : ["omniroute", "deepseek", "qwen"].includes(card.agentType || "")
      ? "OmniRoute Agent"
      : card.title);
export const statusName = (card: CanvasCard) =>
  isBusy(card)
    ? "Responding"
    : card.status === "error"
      ? "Needs attention"
      : card.status === "approval_required"
        ? "Review plan"
        : "Ready";
