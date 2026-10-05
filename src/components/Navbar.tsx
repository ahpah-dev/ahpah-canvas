import React from "react";
import {
  ArrowUpRight,
  Database,
  FolderKanban,
  Settings,
} from "lucide-react";

interface NavbarProps {
  currentView: "site" | "canvas";
  onSwitchView: (view: "site" | "canvas") => void;
  onOpenMemory: () => void;
  onOpenWorkspaces: () => void;
  onOpenSettings: () => void;
  onOpenOneClickSetup: () => void;
  memoryCount: number;
  activeAgentsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSwitchView,
  onOpenMemory,
  onOpenWorkspaces,
  onOpenSettings,
  memoryCount,
}) =>
  currentView === "site" ? (
    <header className="lp-site-header">
      <div className="lp-site-nav">
        <button
          className="lp-nav-brand"
          onClick={() => {
            onSwitchView("site");
            window.scrollTo({
              top: 0,
              behavior:
                document.documentElement.dataset.canvasMotion === "none" ||
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
          }}
          aria-label="AhPah Canvas home"
        >
          <span className="lp-brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          AhPah <span>Canvas</span>
        </button>
        <nav className="lp-nav-links" aria-label="Main navigation">
          <a href="#workspace">Workspace</a>
          <a href="#workflow">Features</a>
          <a href="#providers">Providers</a>
        </nav>
        <div className="lp-nav-actions">
          <button
            className="lp-nav-settings"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Workspace settings"
          >
            <Settings size={16} />
          </button>
          <button
            className="lp-nav-launch"
            onClick={() => onSwitchView("canvas")}
          >
            Open canvas <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </header>
  ) : (
    <header className="cw-nav">
      <button
        className="cw-nav-brand"
        onClick={() => onSwitchView("site")}
        aria-label="AhPah Canvas home"
      >
        <span className="lp-brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <strong>
          AhPah <span>Canvas</span>
        </strong>
      </button>
      <div className="cw-nav-project">
        <span>/</span>
        <FolderKanban size={13} />
        <span>My workspace</span>
        <span className="cw-nav-local">LOCAL</span>
      </div>
      <nav aria-label="Workspace navigation">
        <button onClick={onOpenMemory} aria-label="Project memory">
          <Database size={14} />
          <span>Memory</span>
          {memoryCount > 0 && <small>{memoryCount}</small>}
        </button>
        <button onClick={onOpenWorkspaces} aria-label="Workspaces">
          <FolderKanban size={14} />
          <span>Workspaces</span>
        </button>
        <button onClick={onOpenSettings} aria-label="Settings">
          <Settings size={15} />
          <span>Settings</span>
        </button>
      </nav>
    </header>
  );
