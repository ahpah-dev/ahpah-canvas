import React, { useState } from "react";
import {
  Globe,
  RotateCw,
  Smartphone,
  Monitor,
  ExternalLink,
  X,
  ArrowRight,
  Link,
} from "lucide-react";
import type { CanvasCard } from "../../types/canvas";
interface BrowserPreviewCardProps {
  card: CanvasCard;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<CanvasCard>) => void;
  onDelete: () => void;
}
export function BrowserPreviewCard({
  card,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
}: BrowserPreviewCardProps) {
  const [address, setAddress] = useState(card.browserUrl || "");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const url = card.browserUrl || "";
  const mobile = card.browserDevice === "mobile";
  const navigate = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(address) ? address : `http://${address}`,
      );
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      if (parsed.origin === window.location.origin)
        throw new Error(
          "This is the canvas itself. Use another page to avoid nesting the workspace.",
        );
      onUpdate({ browserUrl: parsed.href, lastAction: "Preview URL updated" });
      setAddress(parsed.href);
      setError("");
      setRevision((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Enter a valid HTTP or HTTPS URL.",
      );
    }
  };
  return (
    <section
      className={`cw-card cw-browser ${isSelected ? "selected" : ""}`}
      style={{ width: card.width, height: card.height }}
      onClick={onSelect}
      aria-label="Browser preview card"
    >
      <header
        className="cw-card-header card-drag-handle"
        data-testid={`drag-${card.id}`}
      >
        <span className="cw-icon-tile cyan">
          <Globe size={17} />
        </span>
        <div className="cw-card-heading">
          <h2>Browser preview</h2>
          <p>A window into what you’re building.</p>
        </div>
        <div
          className="cw-header-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-label="Reload preview"
            disabled={!url}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCw size={13} />
          </button>
          <button
            aria-label="Desktop preview"
            aria-pressed={!mobile}
            onClick={() => onUpdate({ browserDevice: "desktop" })}
          >
            <Monitor size={13} />
          </button>
          <button
            aria-label="Mobile preview"
            aria-pressed={mobile}
            onClick={() => onUpdate({ browserDevice: "mobile" })}
          >
            <Smartphone size={13} />
          </button>
          <button aria-label="Close browser preview" onClick={onDelete}>
            <X size={14} />
          </button>
        </div>
      </header>
      <form className="cw-browser-address" onSubmit={navigate}>
        <Link size={12} />
        <input
          aria-label="Preview URL"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="http://localhost:3000"
        />
        <button type="submit" aria-label="Load preview">
          <ArrowRight size={13} />
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open preview in new tab"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </form>
      {error && (
        <p className="cw-inline-error" role="alert">
          {error}
        </p>
      )}
      <div className={`cw-browser-body ${mobile ? "mobile" : ""}`}>
        {url ? (
          <iframe
            key={`${url}-${revision}`}
            src={url}
            title="Embedded browser preview"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="cw-tool-empty">
            <Globe size={32} />
            <h3>Bring your project into view.</h3>
            <p>
              Enter the URL of your running app above.
              <br />
              Your real page will appear here.
            </p>
          </div>
        )}
      </div>
      <footer className="cw-tool-footer">
        <span>{mobile ? "Mobile width · 375px" : "Desktop preview"}</span>
        <span>Some sites block embedded previews.</span>
      </footer>
    </section>
  );
}
