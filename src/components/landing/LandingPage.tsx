import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, AudioLines, Check, ChevronDown,
  Command, Database, FileCode2, Folder, FolderKanban, GitBranch,
  Layers3, Maximize2, Mic, Minus, Moon, MoreHorizontal, MousePointer2, Plus,
  Plug, Radio, Search, ShieldCheck, Sparkles, Sun, Terminal,
} from 'lucide-react';
import './landing.css';

interface LandingPageProps {
  onLaunchCanvas: () => void;
  onOpenMemory: () => void;
  onOpenWorkspaces: () => void;
  onOpenOneClickSetup: () => void;
}

const scenes = [
  { name: 'Build', project: 'Design system', prompt: 'Build a beautiful dashboard with a reusable component system.', task: 'Create the dashboard components', file: 'components/dashboard.tsx', note: 'Keep the interface calm. Use generous spacing and clear hierarchy.', worker: 'Review the component structure', result: 'A clear foundation for your next big idea.' },
  { name: 'Explore', project: 'Product discovery', prompt: 'Explore three directions for our next product experience.', task: 'Map the product experience', file: 'research/experience.md', note: 'Start with the user’s goal. Make the next action obvious.', worker: 'Compare the proposed directions', result: 'Three directions. One shared workspace.' },
  { name: 'Plan', project: 'Launch roadmap', prompt: 'Turn this product idea into a focused launch plan.', task: 'Break the launch into milestones', file: 'planning/roadmap.md', note: 'Ship a focused first version. Keep each milestone measurable.', worker: 'Review scope and dependencies', result: 'A focused plan, with room to grow.' },
];

function CanvasShowcase({ onLaunch }: { onLaunch: () => void }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [lightPreview, setLightPreview] = useState(false);
  const sceneTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const scene = scenes[sceneIndex];
  const navigateScenes = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % scenes.length
      : event.key === 'ArrowLeft' ? (index + scenes.length - 1) % scenes.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? scenes.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setSceneIndex(next);
    sceneTabs.current[next]?.focus();
  };
  return (
    <div className={`lp-showcase${lightPreview ? ' lp-preview-light' : ''}`} id="workspace">
      <div className="lp-showcase-halo" aria-hidden="true" />
      <div className="lp-showcase-topline">
        <span><span className="lp-dot" /> YOUR IDEAS, IN MOTION</span>
        <div className="lp-scene-tabs" role="tablist" aria-label="Canvas preview examples" style={{ '--lp-scene': sceneIndex } as React.CSSProperties}>
          {scenes.map((item, index) => <button key={item.name} id={`lp-scene-${index}`} ref={(node) => { sceneTabs.current[index] = node; }} role="tab" aria-selected={sceneIndex === index} aria-controls="lp-scene-panel" tabIndex={sceneIndex === index ? 0 : -1} onKeyDown={(event) => navigateScenes(event, index)} onClick={() => setSceneIndex(index)}>{item.name}</button>)}
        </div>
        <button className="lp-preview-theme" aria-pressed={lightPreview} aria-label="Light preview" onClick={() => setLightPreview((value) => !value)}><span className="lp-preview-theme-icon" key={String(lightPreview)}>{lightPreview ? <Sun size={13} /> : <Moon size={13} />}</span><span>{lightPreview ? 'Daylight' : 'Midnight'}</span></button>
      </div>
      <div className="lp-app-frame">
        <div className="lp-app-topbar">
          <div className="lp-window-dots" aria-hidden="true"><i /><i /><i /></div>
          <span className="lp-app-breadcrumb"><Folder size={13} /> Workspace <span>/</span> <strong>{scene.project}</strong><ChevronDown size={12} /></span>
          <button onClick={onLaunch} className="lp-preview-open">Open canvas <ArrowUpRight size={12} /></button>
        </div>
        <div className="lp-app-body">
          <aside className="lp-demo-sidebar">
            <div className="lp-sidebar-title"><Layers3 size={15} /> Mission Control <MoreHorizontal size={15} /></div>
            <span className="lp-sidebar-caption">YOUR WORKSPACE</span>
            <div className="lp-sidebar-item selected"><Radio size={14} /><div>OmniRoute<span>Lead agent</span></div><i /></div>
            <div className="lp-sidebar-item"><Sparkles size={14} /><div>Kilo Auto Free<span>Review agent</span></div><i className="cyan" /></div>
            <div className="lp-sidebar-item"><Database size={14} /><div>Project memory<span>Context & decisions</span></div></div>
            <div className="lp-sidebar-divider" />
            <span className="lp-sidebar-caption">ON THE CANVAS</span>
            <p><FileCode2 size={13} /> Agent responses <span>02</span></p>
            <p><Terminal size={13} /> Terminal <span>01</span></p>
            <p><Database size={13} /> Notes <span>01</span></p>
            <div className="lp-sidebar-bottom"><ShieldCheck size={14} /><div>Your workspace.<br /><span>Your connections.</span></div></div>
          </aside>
          <div className="lp-demo-canvas" id="lp-scene-panel" role="tabpanel" aria-labelledby={`lp-scene-${sceneIndex}`} tabIndex={0}>
            <div className="lp-canvas-project"><span className="lp-dot" /> {scene.project}<span className="lp-sample-badge">Sample workspace</span></div>
            <svg className="lp-wires" viewBox="0 0 900 520" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="lp-wire"><stop stopColor="#a78bfa" /><stop offset="1" stopColor="#55d6e8" /></linearGradient></defs>
              <path d="M400 180 C 500 180 420 120 550 120" /><path d="M400 230 C 470 230 460 365 565 365" />
              <path className="lp-wire-flow" d="M400 180 C 500 180 420 120 550 120" /><path className="lp-wire-flow second" d="M400 230 C 470 230 460 365 565 365" />
              <circle cx="400" cy="180" r="4" /><circle cx="550" cy="120" r="4" /><circle cx="565" cy="365" r="4" />
            </svg>
            <div className="lp-demo-cards" key={scene.name}>
              <article className="lp-demo-card lp-lead-card">
                <header><span className="lp-agent-icon purple"><Radio size={15} /></span><div>OmniRoute <span>Lead agent</span></div><span className="lp-card-tag">GATEWAY</span><MoreHorizontal size={15} /></header>
                <div className="lp-card-content">
                  <div className="lp-prompt"><span>YOU</span><p>{scene.prompt}</p></div>
                  <div className="lp-agent-answer"><span><Sparkles size={12} /> WORKSPACE EXAMPLE</span><p>{scene.result}</p></div>
                  <div className="lp-code-block"><div><FileCode2 size={12} /> {scene.file}<span>{sceneIndex === 0 ? 'TSX' : 'MD'}</span></div>{sceneIndex === 0 ? <pre><code><span className="lp-code-purple">export default</span> function <span className="lp-code-blue">Dashboard</span>() {'{'}{'\n'}  <span className="lp-code-purple">return</span> ({'\n'}    &lt;<span className="lp-code-green">Workspace</span> layout="canvas"&gt;{'\n'}      &lt;<span className="lp-code-green">YourNextIdea</span> /&gt;{'\n'}    &lt;/<span className="lp-code-green">Workspace</span>&gt;{'\n'}  );{'\n'}{'}'}</code></pre> : <pre><code><span className="lp-code-purple"># {scene.project}</span>{'\n\n'}<span className="lp-code-blue">01</span> Define the goal{'\n'}<span className="lp-code-blue">02</span> Explore the possibilities{'\n'}<span className="lp-code-blue">03</span> Make the next move{'\n\n'}<span className="lp-code-green">→ {scene.result}</span></code></pre>}</div>
                  <div className="lp-card-result"><Check size={13} /> {scene.task}</div>
                </div>
                <footer><span><GitBranch size={12} /> main</span><span>Current model via gateway <ShieldCheck size={11} /></span></footer>
              </article>
              <article className="lp-demo-card lp-worker-card">
                <header><span className="lp-agent-icon cyan"><Sparkles size={15} /></span><div>Kilo Auto Free<span>Review agent</span></div><MoreHorizontal size={15} /></header>
                <div className="lp-card-content"><div className="lp-worker-label"><span className="lp-dot cyan" /> AUTO MODEL ROUTING</div><p>{scene.worker}</p><div className="lp-review-line"><Check size={12} /><span>Clear structure</span></div><div className="lp-review-line"><Check size={12} /><span>Shared context</span></div><div className="lp-review-line"><Check size={12} /><span>Ready for your next prompt</span></div></div>
                <footer><span>kilo-auto/free</span><span className="lp-code-blue">Dynamic selection</span></footer>
              </article>
              <article className="lp-demo-card lp-note-card"><header><span className="lp-agent-icon amber"><Database size={14} /></span><div>Project memory<span>A little context goes a long way</span></div><MoreHorizontal size={14} /></header><div className="lp-card-content"><span className="lp-note-label">DESIGN DECISION</span><p>{scene.note}</p><div className="lp-note-tags"><span>project context</span><span>keep close</span></div></div></article>
            </div>
            <div className="lp-demo-cursor" aria-hidden="true"><MousePointer2 size={17} fill="#ae9bff" /><span>You, directing the work</span></div>
            <div className="lp-canvas-tools" aria-hidden="true"><MousePointer2 size={15} /><span /><Plus size={15} /><Layers3 size={15} /><Database size={15} /><span /><Minus size={14} /><small>100%</small><Plus size={14} /><Maximize2 size={14} /></div>
          </div>
        </div>
        <div className="lp-app-command"><span className="lp-command-icon"><Command size={14} /></span><span>One place for your next “what if…”</span><button onClick={onLaunch}>Start creating <ArrowRight size={13} /></button></div>
      </div>
      <div className="lp-showcase-caption"><span>Choose a scene to explore the canvas.</span><span>Sample workspace · connect a provider to start creating</span></div>
    </div>
  );
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchCanvas, onOpenMemory, onOpenWorkspaces, onOpenOneClickSetup }) => {
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = pageRef.current?.querySelectorAll('.lp-reveal');
    if (!nodes) return;
    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lp-page" ref={pageRef}>
      <div>
        <section className="lp-hero">
          <div className="lp-hero-grid" aria-hidden="true" /><div className="lp-hero-light" aria-hidden="true" /><div className="lp-hero-orbits" aria-hidden="true"><i /><i /><i /><span className="lp-orbit-point"><Layers3 size={17} /></span><span className="lp-orbit-point cyan"><Sparkles size={15} /></span></div>
          <div className="lp-hero-copy">
            <button className="lp-announcement lp-enter" onClick={onOpenOneClickSetup}><span><Sparkles size={12} /> YOUR PROVIDERS. ONE CANVAS.</span><ArrowRight size={12} /></button>
            <h1 className="lp-enter lp-enter-1">Big ideas deserve<br /><span>an infinite canvas.</span></h1>
            <p className="lp-enter lp-enter-2">A little less switching. A lot more creating.<br /> Bring your AI agents, ideas, and context into one beautiful workspace.</p>
            <div className="lp-hero-actions lp-enter lp-enter-3"><button className="lp-button lp-button-primary" onClick={onLaunchCanvas}>Open your canvas <ArrowUpRight size={17} /></button><a className="lp-button lp-button-secondary" href="#workspace">Explore the workspace <ArrowDown size={15} /></a></div>
            <div className="lp-hero-details lp-enter lp-enter-3"><span><Check size={12} /> Your own providers</span><span><Check size={12} /> Current model catalogs</span><span><Check size={12} /> Room to think</span></div>
          </div>
          <div className="lp-container lp-enter lp-enter-4"><CanvasShowcase onLaunch={onLaunchCanvas} /></div>
        </section>

        <section className="lp-provider-strip lp-container lp-reveal" aria-label="Supported providers"><span>BUILT AROUND<br /><strong>YOUR TOOLS.</strong></span><div><Radio size={20} /> OmniRoute</div><div><Sparkles size={20} /> Kilo Auto Free</div><div><Plug size={20} /> Custom APIs</div></section>

        <section className="lp-features lp-container" id="workflow">
          <div className="lp-section-heading lp-reveal"><span className="lp-eyebrow"><span /> A BETTER WAY TO BUILD</span><h2>Stay in your flow.<br /><span>See the bigger picture.</span></h2><p>Your best work happens when everything clicks.<br /> Give every agent a place, and every idea room to grow.</p></div>
          <div className="lp-bento">
            <article className="lp-feature-card lp-feature-wide lp-reveal"><div className="lp-feature-copy"><span className="lp-feature-icon"><Layers3 size={20} /></span><span className="lp-feature-number">01 / THE CANVAS</span><h3>Everything in view.<br />Nothing in your way.</h3><p>Arrange agent cards, notes, and tools on an open surface. Build a workspace around the way you think.</p><button className="lp-text-link" onClick={onLaunchCanvas}>Make it your own <ArrowUpRight size={15} /></button></div><div className="lp-spatial-art" aria-hidden="true"><div className="lp-spatial-grid" /><div className="lp-spatial-card back"><Database size={15} /><span>Project context</span><i /><i /></div><div className="lp-spatial-card middle"><Sparkles size={15} /><span>Kilo Auto Free</span><i /><i /><i /></div><div className="lp-spatial-card front"><Radio size={15} /><span>OmniRoute</span><p>Where your next idea begins.</p><div><span /><span /><span /></div></div><div className="lp-spatial-cursor"><MousePointer2 size={18} /> <span>A space that’s yours</span></div></div></article>
            <article className="lp-feature-card lp-feature-voice lp-reveal"><div className="lp-feature-copy"><span className="lp-feature-icon"><AudioLines size={20} /></span><span className="lp-feature-number">02 / YOUR DIRECTION</span><h3>Think it. Say it.<br />Keep moving.</h3><p>Use the canvas voice controls or type directly to a card. Your next instruction is always close.</p></div><div className="lp-voice-art" aria-hidden="true"><div className="lp-mic-orbit"><Mic size={24} /></div><div className="lp-waveform">{Array.from({ length: 29 }, (_, index) => <i key={index} style={{ '--bar-height': `${12 + Math.abs(Math.sin(index * 1.8)) * 31}px`, '--bar-delay': `${index * -0.11}s` } as React.CSSProperties} />)}</div><span>“Let’s build something great.”</span></div></article>
            <article className="lp-feature-card lp-feature-memory lp-reveal"><div className="lp-memory-art" aria-hidden="true"><div className="lp-memory-search"><Search size={14} /> Search your project context <span>⌘ K</span></div><div className="lp-memory-row"><span><Database size={14} /></span><div>Design decisions<small>The details worth keeping</small></div><span className="lp-memory-type">CONTEXT</span></div><div className="lp-memory-row"><span><FileCode2 size={14} /></span><div>Project notes<small>Right where you need them</small></div><span className="lp-memory-type">NOTES</span></div><div className="lp-memory-row faded"><span><GitBranch size={14} /></span><div>Your next chapter<small>Pick up with the whole picture</small></div></div></div><div className="lp-feature-copy"><span className="lp-feature-number">03 / SHARED CONTEXT</span><h3>Good ideas don’t<br />start from zero.</h3><p>Keep project facts, decisions, and notes in your memory hub. Revisit the context that makes the next step clearer.</p><button className="lp-text-link" onClick={onOpenMemory}>Open your memory <ArrowUpRight size={15} /></button></div></article>
            <article className="lp-feature-card lp-feature-workspace lp-reveal"><div className="lp-feature-copy"><span className="lp-feature-icon"><FolderKanban size={20} /></span><span className="lp-feature-number">04 / YOUR SPACE</span><h3>A fresh canvas.<br />A familiar setup.</h3><p>Choose a workspace layout and bring the right tools into focus. Make room for whatever comes next.</p><button className="lp-text-link" onClick={onOpenWorkspaces}>Explore workspaces <ArrowUpRight size={15} /></button></div><div className="lp-workspace-art" aria-hidden="true"><div><i /><i /><i /><i /></div><span><FolderKanban size={13} /> Your next project <ArrowUpRight size={13} /></span></div></article>
          </div>
        </section>

        <section className="lp-connections lp-container lp-reveal" id="providers"><div className="lp-connection-copy"><span className="lp-eyebrow"><span /> CONNECT YOUR INTELLIGENCE</span><h2>Your providers.<br /><span>Your possibilities.</span></h2><p>Connect OmniRoute, use Kilo Auto Free, or bring your own OpenAI-compatible API. Choose from your provider’s current models and keep every conversation in one place.</p><button className="lp-button lp-button-secondary" onClick={onOpenOneClickSetup}>Set up your providers <ArrowRight size={15} /></button><div className="lp-connection-note"><ShieldCheck size={13} /><span>Workspace exports keep API keys private.</span></div></div><div className="lp-connection-art"><div className="lp-provider-node"><span className="lp-provider-symbol"><Radio size={24} /></span><div><strong>OmniRoute</strong><small>Your gateway. Your model catalog.</small></div><ArrowDown size={14} /></div><div className="lp-connection-line"><i /><span>OPENAI-COMPATIBLE CONNECTIONS</span><i /></div><div className="lp-hub"><span className="lp-brand-mark"><i /><i /><i /><i /></span><strong>One canvas. More possibility.</strong><span>AhPah Canvas</span></div><div className="lp-connection-line"><i /><span>DYNAMIC FREE MODEL ROUTING</span><i /></div><div className="lp-provider-node kilo"><span className="lp-provider-symbol"><Sparkles size={24} /></span><div><strong>Kilo Auto Free</strong><small>Current models, selected by Kilo.</small></div><ArrowUpRight size={14} /></div><div className="lp-custom-provider"><Plug size={13} /><span>And your own compatible API.</span><span>YOUR CHOICE</span></div></div></section>

        <section className="lp-final-cta lp-reveal"><div className="lp-cta-grid" aria-hidden="true" /><div className="lp-cta-orb" aria-hidden="true"><i /><i /><i /></div><div className="lp-container"><span className="lp-eyebrow">LESS FRICTION. MORE POSSIBILITY.</span><h2>Your next big thing<br /><span>starts with a little space.</span></h2><button className="lp-button lp-button-primary" onClick={onLaunchCanvas}>Find your flow <ArrowUpRight size={17} /></button><p>A canvas for the way you create.</p></div></section>
      </div>
      <footer className="lp-footer lp-container"><div><span className="lp-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><strong>AhPah Canvas</strong><span>Open source · MIT licensed</span></div><nav aria-label="Footer navigation"><button onClick={onLaunchCanvas}>Canvas</button><button onClick={onOpenOneClickSetup}>Providers</button><a href="https://github.com/ahpah-dev/ahpah-canvas" target="_blank" rel="noopener noreferrer"><FileCode2 size={13} /> Source <ArrowUpRight size={12} /></a></nav></footer>
    </div>
  );
};
