import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Code2,
  FileCode2, FileDiff, Folder, FolderKanban, Moon, Play,
  Plug, Radio, RotateCcw, Search, ShieldCheck, Sparkles, Sun, Terminal,
} from "lucide-react";
import "./landing.css";

interface LandingPageProps {
  onLaunchCode: () => void;
  onLaunchCanvas: () => void;
  onOpenMemory: () => void;
  onOpenWorkspaces: () => void;
  onOpenOneClickSetup: () => void;
}

const scenes = [
  {
    name: "Build", project: "studio-dashboard", file: "src/App.tsx",
    prompt: "Build a responsive project dashboard with search and a clear empty state.",
    actions: ["Read src/App.tsx", "Search project components", "Stage dashboard changes"],
    summary: "A focused dashboard, ready for your review.", additions: 24, deletions: 8,
    code: [
      'import { useState } from "react";',
      'import { projects } from "./data";',
      '',
      'export default function App() {',
      '  const [query, setQuery] = useState("");',
      '  const results = projects.filter((project) =>',
      '    project.name.toLowerCase().includes(',
      '      query.toLowerCase(),',
      '    ),',
      '  );',
      '',
      '  return (',
      '    <main className="dashboard">',
      '      <ProjectSearch value={query}',
      '        onChange={setQuery} />',
      '      <ProjectGrid projects={results} />',
      '    </main>',
      '  );',
      '}',
    ],
  },
  {
    name: "Debug", project: "request-lifecycle", file: "src/useSearch.ts",
    prompt: "Find why old search results replace newer ones. Propose a small, reviewable fix.",
    actions: ["Read src/useSearch.ts", "Search request lifecycle", "Stage cancellation fix"],
    summary: "Stale requests are canceled before the next search.", additions: 9, deletions: 3,
    code: [
      'import { useEffect, useState } from "react";',
      '',
      'export function useSearch(query: string) {',
      '  const [results, setResults] = useState([]);',
      '',
      '  useEffect(() => {',
      '    const controller = new AbortController();',
      '',
      '    search(query, { signal: controller.signal })',
      '      .then(setResults)',
      '      .catch((error) => {',
      '        if (error.name !== "AbortError")',
      '          reportError(error);',
      '      });',
      '',
      '    return () => controller.abort();',
      '  }, [query]);',
      '',
      '  return results;',
      '}',
    ],
  },
  {
    name: "Refactor", project: "component-library", file: "src/Button.tsx",
    prompt: "Extract a reusable button. Preserve keyboard access and the existing public API.",
    actions: ["List component files", "Read existing button styles", "Stage reusable component"],
    summary: "A smaller component with explicit, typed variants.", additions: 18, deletions: 12,
    code: [
      'import type { ButtonHTMLAttributes }',
      '  from "react";',
      '',
      'type ButtonProps =',
      '  ButtonHTMLAttributes<HTMLButtonElement> & {',
      '    variant?: "primary" | "secondary";',
      '  };',
      '',
      'export function Button({',
      '  variant = "primary",',
      '  type = "button",',
      '  ...props',
      '}: ButtonProps) {',
      '  return (',
      '    <button type={type}',
      '      className={`button ${variant}`}',
      '      {...props} />',
      '  );',
      '}',
    ],
  },
];

function CodeLine({ text }: { text: string }) {
  return text.split(/("[^"\n]*"|\b(?:import|from|export|default|function|const|return|type|useEffect|useState)\b)/).map((piece, index) =>
    <span key={index} className={piece.startsWith('"') ? "lp-code-green" : /^(import|from|export|default|function|const|return|type)$/.test(piece) ? "lp-code-purple" : /^(useEffect|useState)$/.test(piece) ? "lp-code-blue" : undefined}>{piece}</span>,
  );
}

function EngineeringShowcase({ onLaunch, workspaceDrop, onWorkspaceDropEnd }: { onLaunch: () => void; workspaceDrop: boolean; onWorkspaceDropEnd: () => void }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [lightPreview, setLightPreview] = useState(false);
  const sceneTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const scene = scenes[sceneIndex];
  const navigateScenes = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = event.key === "ArrowRight" ? (index + 1) % scenes.length
      : event.key === "ArrowLeft" ? (index + scenes.length - 1) % scenes.length
        : event.key === "Home" ? 0 : event.key === "End" ? scenes.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setSceneIndex(next);
    sceneTabs.current[next]?.focus();
  };
  return (
    <div className={`lp-showcase lp-engineering-showcase${lightPreview ? " lp-preview-light" : ""}${workspaceDrop ? " lp-workspace-drop" : ""}`} id="workspace" onAnimationEnd={event => { if (event.animationName === "lp-workspace-slide-down") onWorkspaceDropEnd(); }}>
      <div className="lp-showcase-halo" aria-hidden="true" />
      <div className="lp-showcase-topline">
        <span><span className="lp-dot" /> THE WORK, RIGHT IN FRONT OF YOU</span>
        <div className="lp-scene-tabs" role="tablist" aria-label="Coding workflow examples" style={{ "--lp-scene": sceneIndex } as React.CSSProperties}>
          {scenes.map((item, index) => <button key={item.name} id={`lp-scene-${index}`} ref={(node) => { sceneTabs.current[index] = node; }} role="tab" aria-selected={sceneIndex === index} aria-controls="lp-scene-panel" tabIndex={sceneIndex === index ? 0 : -1} onKeyDown={(event) => navigateScenes(event, index)} onClick={() => setSceneIndex(index)}>{item.name}</button>)}
        </div>
        <button className="lp-preview-theme" aria-pressed={lightPreview} aria-label="Switch sample preview theme" onClick={() => setLightPreview((value) => !value)}><span className="lp-preview-theme-icon" key={String(lightPreview)}>{lightPreview ? <Sun size={13} /> : <Moon size={13} />}</span><span>{lightPreview ? "Daylight" : "Midnight"}</span></button>
      </div>
      <div className="lp-app-frame">
        <div className="lp-app-topbar">
          <div className="lp-window-dots" aria-hidden="true"><i /><i /><i /></div>
          <span className="lp-app-breadcrumb"><Folder size={13} /> Projects <span>/</span> <strong>{scene.project}</strong><ChevronDown size={12} /></span>
          <button onClick={onLaunch} className="lp-preview-open">Open Code <ArrowUpRight size={12} /></button>
        </div>
        <div className="lp-engineering-body" id="lp-scene-panel" role="tabpanel" aria-labelledby={`lp-scene-${sceneIndex}`} tabIndex={0}>
          <aside className="lp-file-tree">
            <div className="lp-engineering-panel-label"><FolderKanban size={13} /> EXPLORER <span>PROJECT</span></div>
            <p><ChevronDown size={12} /><Folder size={13} /> {scene.project}</p>
            <div className="lp-tree-folder"><ChevronDown size={11} /><Folder size={13} /> src</div>
            {[scene.file.replace("src/", ""), "styles.css", "data.ts"].map((file, index) => <div className={`lp-tree-file${index === 0 ? " selected" : ""}`} key={file}><FileCode2 size={13} />{file}{index === 0 && <i />}</div>)}
            <div className="lp-tree-file root"><FileCode2 size={13} />index.html</div>
            <div className="lp-tree-file root"><FileCode2 size={13} />package.json</div>
            <div className="lp-tree-context"><ShieldCheck size={14} /><strong>Your project, in context.</strong><span>Agents read files and propose changes for review.</span></div>
          </aside>
          <div className="lp-code-editor">
            <div className="lp-editor-tabs"><span><FileCode2 size={13} />{scene.file.replace("src/", "")}<i /></span><small>TypeScript React</small></div>
            <div className="lp-editor-breadcrumb">src <span>/</span> {scene.file.replace("src/", "")} <span>/</span> {scene.name === "Debug" ? "useSearch" : scene.name === "Refactor" ? "Button" : "App"}</div>
            <div className="lp-code-editor-body" key={scene.name}>
              {scene.code.map((line, index) => <div className={`lp-editor-line${index === 5 || index === 6 ? " highlighted" : ""}`} key={index}><span>{index + 1}</span><code><CodeLine text={line || " "} /></code></div>)}
            </div>
            <div className="lp-editor-status"><span><Code2 size={11} /> UTF-8 <i /> TSX</span><span>Project files <i /> Ready to review</span></div>
          </div>
          <aside className="lp-engineering-agent">
            <div className="lp-engineering-panel-label"><Sparkles size={13} /> CODING AGENT <span>SAMPLE</span></div>
            <div className="lp-task-prompt"><span>YOUR TASK</span><p>{scene.prompt}</p></div>
            <div className="lp-tool-timeline" key={scene.name}>{scene.actions.map((action, index) => <div key={action}><span>{index === 0 ? <FileCode2 size={12} /> : index === 1 ? <Search size={12} /> : <FileDiff size={12} />}</span><p>{action}<small>{index === 2 ? "Proposed changes" : "Project context"}</small></p><Check size={11} /></div>)}</div>
            <div className="lp-staged-review"><span><FileDiff size={12} /> 1 file to review <small>+{scene.additions} <i>−{scene.deletions}</i></small></span><p>{scene.summary}</p><button onClick={onLaunch}>Review changes <ArrowRight size={12} /></button></div>
            <div className="lp-agent-context"><Radio size={11} /> Your connected model provider</div>
          </aside>
        </div>
        <div className="lp-engineering-runbar"><span><Terminal size={13} /> Read → search → propose → review</span><button onClick={onLaunch}><Play size={11} /> Start your own project <ArrowRight size={12} /></button></div>
      </div>
      <div className="lp-showcase-caption"><span>Build, debug, or refactor. You direct the work.</span><span>Illustrative project · connect a provider to run an agent</span></div>
    </div>
  );
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchCode, onLaunchCanvas, onOpenOneClickSetup }) => {
  const pageRef = useRef<HTMLDivElement>(null);
  const [workspaceDrop, setWorkspaceDrop] = useState(false);
  useEffect(() => {
    const nodes = pageRef.current?.querySelectorAll(".lp-reveal");
    if (!nodes) return;
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  const showWorkspace = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const workspace = pageRef.current?.querySelector<HTMLElement>("#workspace");
    if (!workspace) return;
    const motionOff = document.documentElement.dataset.canvasMotion === "none" ||
      document.documentElement.dataset.canvasMotion === "off" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (motionOff) setWorkspaceDrop(false);
    else { setWorkspaceDrop(false); requestAnimationFrame(() => setWorkspaceDrop(true)); }
    workspace.scrollIntoView({ behavior: motionOff ? "instant" : "smooth", block: "start" });
  };

  return (
    <div className="lp-page" ref={pageRef}>
      <div>
        <section className="lp-hero">
          <div className="lp-hero-grid" aria-hidden="true" /><div className="lp-hero-light" aria-hidden="true" /><div className="lp-hero-orbits" aria-hidden="true"><i /><i /><i /><span className="lp-orbit-point"><Code2 size={17} /></span><span className="lp-orbit-point cyan"><Sparkles size={15} /></span></div>
          <div className="lp-hero-copy">
            <button className="lp-announcement lp-enter" onClick={onOpenOneClickSetup}><span><Sparkles size={12} /> YOUR MODELS. YOUR CODE. YOUR CALL.</span><ArrowRight size={12} /></button>
            <h1 className="lp-enter lp-enter-1">From idea to<br /><span>working software.</span></h1>
            <p className="lp-enter lp-enter-2">Give your agents a project to work on.<br /> Read the code, review the changes, and see what you’re building.</p>
            <div className="lp-hero-actions lp-enter lp-enter-3"><button className="lp-button lp-button-primary" onClick={onLaunchCode}>Start coding <ArrowUpRight size={17} /></button><a className="lp-button lp-button-secondary" href="#workspace" onClick={showWorkspace}>Explore the workspace <ArrowDown size={15} /></a></div>
            <div className="lp-hero-details lp-enter lp-enter-3"><span><Check size={12} /> Real project files</span><span><Check size={12} /> Reviewable edits</span><span><Check size={12} /> Your own providers</span></div>
          </div>
          <div className="lp-container lp-enter lp-enter-4"><EngineeringShowcase onLaunch={onLaunchCode} workspaceDrop={workspaceDrop} onWorkspaceDropEnd={() => setWorkspaceDrop(false)} /></div>
        </section>

        <section className="lp-provider-strip lp-container lp-reveal" aria-label="Supported providers"><span>BUILT AROUND<br /><strong>YOUR MODELS.</strong></span><div><Radio size={20} /> OmniRoute</div><div><Sparkles size={20} /> Kilo Auto Free</div><div><Plug size={20} /> Custom APIs</div></section>

        <section className="lp-features lp-container" id="workflow">
          <div className="lp-section-heading lp-reveal"><span className="lp-eyebrow"><span /> A WORKSPACE FOR THE WHOLE CHANGE</span><h2>Less copying code.<br /><span>More building with it.</span></h2><p>Keep your files, agent tasks, and proposed changes together.<br /> Take an idea through to something you can inspect.</p></div>
          <div className="lp-bento">
            <article className="lp-feature-card lp-feature-wide lp-reveal"><div className="lp-feature-copy"><span className="lp-feature-icon"><Code2 size={20} /></span><span className="lp-feature-number">01 / PROJECT CONTEXT</span><h3>Agents that work<br />with your files.</h3><p>Start a project, open your code, and describe the change. The agent can list, read, and search files before staging edits.</p><button className="lp-text-link" onClick={onLaunchCode}>Open the code workspace <ArrowUpRight size={15} /></button></div><div className="lp-file-art" aria-hidden="true"><div className="lp-file-art-title"><Folder size={14} /> my-project <span>PROJECT FILES</span></div><div><FileCode2 size={14} /><span>src/App.tsx</span><small>READ</small></div><div><Search size={14} /><span>Find related components</span><small>SEARCH</small></div><div className="selected"><FileDiff size={14} /><span>src/styles.css</span><small>STAGED</small></div><footer><Sparkles size={13} /> Context before changes.</footer></div></article>
            <article className="lp-feature-card lp-feature-review lp-reveal"><div className="lp-feature-copy"><span className="lp-feature-icon"><FileDiff size={20} /></span><span className="lp-feature-number">02 / REVIEW THE DIFF</span><h3>See the change.<br />Make the call.</h3><p>Inspect proposed file changes before applying them. Keep the edits you want, and undo an applied change when you need to.</p></div><div className="lp-diff-art" aria-hidden="true"><header><FileCode2 size={12} /> src/App.tsx <span>+3 −1</span></header><div className="removed"><span>−</span> return &lt;EmptyState /&gt;;</div><div className="added"><span>+</span> return projects.length</div><div className="added"><span>+</span>   ? &lt;ProjectGrid /&gt;</div><div className="added"><span>+</span>   : &lt;EmptyState /&gt;;</div><footer><Check size={12} /> Apply changes <RotateCcw size={12} /> Undo available</footer></div></article>
            <article className="lp-feature-card lp-feature-preview lp-reveal"><div className="lp-browser-art" aria-hidden="true"><header><i /><i /><i /><span>PROJECT PREVIEW</span></header><div><div className="lp-mini-browser-side"><span /><span /><span /></div><div className="lp-mini-browser-main"><span>Projects</span><div><i /><i /><i /></div><p /><p /><p /></div></div><footer><ShieldCheck size={12} /> Isolated browser preview</footer></div><div className="lp-feature-copy"><span className="lp-feature-number">03 / SEE IT WORK</span><h3>Your next change,<br />in front of you.</h3><p>Preview supported browser projects beside the editor. Keep the feedback loop close while you refine the result.</p></div></article>
            <article className="lp-feature-card lp-feature-workspace lp-reveal"><div className="lp-feature-copy"><span className="lp-feature-icon"><Terminal size={20} /></span><span className="lp-feature-number">04 / EXPLICIT CONTROL</span><h3>A clear plan.<br />An approved run.</h3><p>Agents can propose supported Node and npm commands in the local app. You review and approve each command before it runs.</p><button className="lp-text-link" onClick={onLaunchCode}>Build your next project <ArrowUpRight size={15} /></button></div><div className="lp-command-art" aria-hidden="true"><span><Terminal size={13} /> PROPOSED COMMAND</span><code>npm run build</code><div><ShieldCheck size={12} /> Waiting for your approval</div></div></article>
          </div>
          <div className="lp-workflow-note lp-reveal"><ShieldCheck size={14} /><p>On the web: project files, agent edits, reviews, and browser previews.<br /><span>Approved local commands require the app running on your computer.</span></p></div>
        </section>

        <section className="lp-connections lp-container lp-reveal" id="providers"><div className="lp-connection-copy"><span className="lp-eyebrow"><span /> CONNECT YOUR INTELLIGENCE</span><h2>Your providers.<br /><span>Your engineering team.</span></h2><p>Connect OmniRoute, use Kilo Auto Free in the local app, or bring an OpenAI-compatible API. Choose from live model catalogs and give each task the context it needs.</p><button className="lp-button lp-button-secondary" onClick={onOpenOneClickSetup}>Set up your providers <ArrowRight size={15} /></button><div className="lp-connection-note"><ShieldCheck size={13} /><span>Workspace exports exclude provider credentials.</span></div></div><div className="lp-connection-art"><div className="lp-provider-node"><span className="lp-provider-symbol"><Radio size={24} /></span><div><strong>OmniRoute</strong><small>Your gateway. Your model catalog.</small></div><ArrowDown size={14} /></div><div className="lp-connection-line"><i /><span>YOUR PROJECT CONTEXT</span><i /></div><div className="lp-hub"><span className="lp-brand-mark"><i /><i /><i /><i /></span><strong>One project. A clear next step.</strong><span>AhPah Canvas</span></div><div className="lp-connection-line"><i /><span>LIVE MODEL CONNECTIONS</span><i /></div><div className="lp-provider-node kilo"><span className="lp-provider-symbol"><Sparkles size={24} /></span><div><strong>Kilo Auto Free</strong><small>Dynamic free routing · local app</small></div><ArrowUpRight size={14} /></div><div className="lp-custom-provider"><Plug size={13} /><span>And your own compatible API.</span><span>YOUR CHOICE</span></div></div></section>

        <section className="lp-final-cta lp-reveal"><div className="lp-cta-grid" aria-hidden="true" /><div className="lp-cta-orb" aria-hidden="true"><i /><i /><i /></div><div className="lp-container"><span className="lp-eyebrow">FROM THE FIRST FILE TO THE NEXT CHANGE.</span><h2>Bring the idea.<br /><span>Build the software.</span></h2><button className="lp-button lp-button-primary" onClick={onLaunchCode}>Open Code <ArrowUpRight size={17} /></button><p>Your files. Your providers. Your final review.</p></div></section>
      </div>
      <footer className="lp-footer lp-container"><div><span className="lp-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><strong>AhPah Canvas</strong><span>Open source · MIT licensed</span></div><nav aria-label="Footer navigation"><button onClick={onLaunchCode}>Code</button><button onClick={onLaunchCanvas}>Canvas</button><button onClick={onOpenOneClickSetup}>Providers</button><a href="https://github.com/ahpah-dev/ahpah-canvas" target="_blank" rel="noopener noreferrer"><FileCode2 size={13} /> Source <ArrowUpRight size={12} /></a></nav></footer>
    </div>
  );
};

