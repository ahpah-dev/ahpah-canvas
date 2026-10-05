import type { CanvasCard } from "../types/canvas";

// Position belongs to the canvas wrapper. It does not change a card's conversation or controls.
export function hasSameCardContent(previous: CanvasCard, next: CanvasCard): boolean {
  if (previous === next) return true;
  const keys = Object.keys(previous) as (keyof CanvasCard)[];
  return keys.length === Object.keys(next).length && keys.every((key) =>
    Object.hasOwn(next, key) && (key === "x" || key === "y" || Object.is(previous[key], next[key])));
}
