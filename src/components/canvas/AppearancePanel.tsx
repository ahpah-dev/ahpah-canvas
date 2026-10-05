import { useState } from "react";
import { Check, Palette, RotateCcw, Sparkles, Grid2X2 } from "lucide-react";
import {
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  type Appearance,
} from "../../utils/appearance";

const accents = [
  { name: "Violet", color: "#b28af0" },
  { name: "Ocean", color: "#52c7d7" },
  { name: "Rose", color: "#ef88ab" },
  { name: "Amber", color: "#e9b66d" },
  { name: "Mint", color: "#7bc7a7" },
];
export function AppearancePanel() {
  const [value, setValue] = useState(loadAppearance);
  const [error, setError] = useState("");
  const update = (patch: Partial<Appearance>) => {
    const next = { ...value, ...patch };
    try {
      saveAppearance(next);
      setValue(next);
      setError("");
    } catch {
      setError(
        "Your browser could not save this theme. Free some browser storage and try again.",
      );
    }
  };
  return (
    <div className="cw-settings-body cw-appearance-panel">
      <div className="cw-settings-section-intro">
        <Palette size={17} />
        <div>
          <h3>Make this space yours.</h3>
          <p>Changes preview instantly and stay saved in this browser.</p>
        </div>
        <span>
          {!error && <Check size={12} />} {error ? "Not saved" : "Auto-saved"}
        </span>
      </div>
      <section>
        <h4>Surface</h4>
        <p>Choose the atmosphere of your workspace.</p>
        <div
          className="cw-surface-options"
          role="group"
          aria-label="Workspace surface"
        >
          {[
            {
              id: "midnight",
              name: "Midnight",
              description: "Soft violet, deep contrast",
            },
            {
              id: "graphite",
              name: "Graphite",
              description: "Neutral and focused",
            },
            {
              id: "daylight",
              name: "Daylight",
              description: "A brighter place to think",
            },
          ].map((surface) => (
            <button
              key={surface.id}
              className={value.surface === surface.id ? "selected" : ""}
              aria-pressed={value.surface === surface.id}
              onClick={() =>
                update({ surface: surface.id as Appearance["surface"] })
              }
            >
              <span className={`cw-theme-thumbnail ${surface.id}`}>
                <i />
                <b />
                <b />
                <em />
              </span>
              <strong>
                {surface.name}
                <Check size={12} />
              </strong>
              <small>{surface.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4>Accent color</h4>
        <p>A little character for buttons, focus, and connections.</p>
        <div className="cw-accent-options">
          {accents.map((accent) => (
            <button
              key={accent.name}
              aria-label={`${accent.name} accent`}
              aria-pressed={value.accent.toLowerCase() === accent.color}
              style={{ background: accent.color }}
              onClick={() => update({ accent: accent.color })}
            >
              {value.accent.toLowerCase() === accent.color && (
                <Check size={17} />
              )}
            </button>
          ))}
          <label className="cw-custom-color">
            <input
              type="color"
              aria-label="Custom accent color"
              value={value.accent}
              onChange={(event) => update({ accent: event.target.value })}
            />
            <span>Custom</span>
          </label>
          <code>{value.accent.toUpperCase()}</code>
        </div>
      </section>
      <section className="cw-appearance-row">
        <div>
          <h4>
            <Sparkles size={14} /> Motion
          </h4>
          <p>
            Smooth transitions with respect for your device’s reduced-motion
            setting.
          </p>
        </div>
        <select
          aria-label="Animation style"
          value={value.motion}
          onChange={(event) =>
            update({ motion: event.target.value as Appearance["motion"] })
          }
        >
          <option value="smooth">Smooth</option>
          <option value="subtle">Subtle</option>
          <option value="none">No animations</option>
        </select>
      </section>
      <section className="cw-appearance-row">
        <div>
          <h4>
            <Grid2X2 size={14} /> Canvas texture
          </h4>
          <p>Set the background behind your cards.</p>
        </div>
        <select
          aria-label="Canvas texture"
          value={value.grid}
          onChange={(event) =>
            update({ grid: event.target.value as Appearance["grid"] })
          }
        >
          <option value="dots">Dot grid</option>
          <option value="lines">Fine lines</option>
          <option value="none">Clean surface</option>
        </select>
      </section>
      <div className="cw-theme-preview">
        <span className="cw-icon-tile">
          <Sparkles size={19} />
        </span>
        <div>
          <strong>Your next idea starts here.</strong>
          <p>One canvas. A little more you.</p>
        </div>
        <button
          className="cw-primary-button"
          onClick={() => update({ ...DEFAULT_APPEARANCE })}
        >
          <RotateCcw size={12} /> Restore defaults
        </button>
      </div>
      {error && (
        <p role="alert" className="cw-inline-error">
          {error}
        </p>
      )}
    </div>
  );
}
