export type Bounds = { x: number; y: number; width: number; height: number };
export type Camera = { x: number; y: number; scale: number };
export const clampScale = (scale: number) => Math.min(2, Math.max(0.15, scale));

export function fitCamera(
  cards: Bounds[],
  width: number,
  height: number,
): Camera {
  if (!cards.length) return { x: 40, y: 80, scale: 1 };
  const left = Math.min(...cards.map((card) => card.x));
  const top = Math.min(...cards.map((card) => card.y));
  const right = Math.max(...cards.map((card) => card.x + card.width));
  const bottom = Math.max(...cards.map((card) => card.y + card.height));
  const availableWidth = Math.max(100, width - 72);
  // Reserve space for the top actions and both docks below the workspace.
  const availableHeight = Math.max(100, height - 240);
  const scale = clampScale(
    Math.min(
      1,
      availableWidth / (right - left),
      availableHeight / (bottom - top),
    ),
  );
  return {
    scale,
    x: (width - (right - left) * scale) / 2 - left * scale,
    y: 70 + (availableHeight - (bottom - top) * scale) / 2 - top * scale,
  };
}

export function zoomCamera(
  camera: Camera,
  scale: number,
  x: number,
  y: number,
): Camera {
  const next = clampScale(scale);
  return {
    scale: next,
    x: x - ((x - camera.x) * next) / camera.scale,
    y: y - ((y - camera.y) * next) / camera.scale,
  };
}

export function arrangeCards<T extends Bounds>(cards: T[], columns = 2): T[] {
  const cellWidth = Math.max(420, ...cards.map((card) => card.width)) + 56;
  const cellHeight = Math.max(360, ...cards.map((card) => card.height)) + 56;
  return cards.map((card, index) => ({
    ...card,
    x: 60 + (index % columns) * cellWidth,
    y: 60 + Math.floor(index / columns) * cellHeight,
  }));
}
