export type Appearance = {
  surface: "midnight" | "graphite" | "daylight";
  accent: string;
  motion: "smooth" | "subtle" | "none";
  grid: "dots" | "lines" | "none";
};
export const DEFAULT_APPEARANCE: Appearance = {
  surface: "midnight",
  accent: "#b28af0",
  motion: "smooth",
  grid: "dots",
};
export function normalizeAppearance(value: unknown): Appearance {
  const candidate =
    value && typeof value === "object" ? (value as Partial<Appearance>) : {};
  return {
    surface: ["midnight", "graphite", "daylight"].includes(
      candidate.surface || "",
    )
      ? candidate.surface!
      : DEFAULT_APPEARANCE.surface,
    accent: /^#[0-9a-f]{6}$/i.test(candidate.accent || "")
      ? candidate.accent!
      : DEFAULT_APPEARANCE.accent,
    motion: ["smooth", "subtle", "none"].includes(candidate.motion || "")
      ? candidate.motion!
      : DEFAULT_APPEARANCE.motion,
    grid: ["dots", "lines", "none"].includes(candidate.grid || "")
      ? candidate.grid!
      : DEFAULT_APPEARANCE.grid,
  };
}
export function loadAppearance(): Appearance {
  try {
    return normalizeAppearance(
      JSON.parse(localStorage.getItem("ahpah_appearance") || "{}"),
    );
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}
export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  root.dataset.canvasSurface = value.surface;
  root.dataset.canvasMotion = value.motion;
  root.dataset.canvasGrid = value.grid;
  root.style.setProperty("--cw-accent", value.accent);
  const channels = value.accent.slice(1).match(/.{2}/g)!.map(channel => {
    const srgb = parseInt(channel, 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  root.style.setProperty("--cw-on-accent", luminance > 0.179 ? "#000000" : "#ffffff");
  window.dispatchEvent(
    new CustomEvent("ahpah-appearance-changed", { detail: value }),
  );
}
export function saveAppearance(value: Appearance) {
  const normalized = normalizeAppearance(value);
  localStorage.setItem("ahpah_appearance", JSON.stringify(normalized));
  applyAppearance(normalized);
}
