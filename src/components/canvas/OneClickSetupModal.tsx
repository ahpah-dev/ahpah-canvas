import { ArrowRight, Check, Code2, Cpu, FolderOpen, Layers3, Radio, X } from 'lucide-react';
import { useDialogPresence } from '../../utils/useDialogPresence';
import { useDialogFocus } from '../../utils/useDialogFocus';
import { supportsLocalBridge } from '../../utils/gateways';
import './gettingStarted.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: (target?: 'local' | 'hosted') => void;
  onApplyOneClickSetup: () => void;
  onLaunchCode: () => void;
}

export function OneClickSetupModal({ isOpen, onClose, onOpenSettings, onApplyOneClickSetup, onLaunchCode }: Props) {
  const present = useDialogPresence(isOpen);
  useDialogFocus(isOpen, onClose);
  if (!present) return null;
  const settings = (target: 'local' | 'hosted') => { onClose(); onOpenSettings(target); };
  return <div data-state={isOpen ? 'open' : 'closed'} className="cw-overlay cw-start-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-hidden={!isOpen} aria-modal="true" aria-labelledby="setup-title" className="cw-modal cw-start-dialog">
      <header><div><span className="cw-start-eyebrow">THE SHORTEST PATH TO YOUR FIRST BUILD</span><h2 id="setup-title">Let’s get you into the flow.</h2><p>Connect a model. Bring your files. Make your first change.</p></div><button type="button" onClick={onClose} aria-label="Close setup"><X size={18} /></button></header>
      <div className="cw-start-content">
        <section className="cw-start-step"><span className="cw-start-number">01</span><div><h3>Choose how your agent runs.</h3><div className="cw-start-choices"><button type="button" onClick={() => settings('local')}><Cpu size={20} /><strong>On your computer</strong><p>Ollama models. No hosted API quota or per-token bill.</p><span>{supportsLocalBridge() ? 'Find your local models' : 'View local setup instructions'}<ArrowRight size={13} /></span></button><button type="button" onClick={() => settings('hosted')}><Radio size={20} /><strong>With your provider</strong><p>Codex, OmniRoute, Kilo, or a custom API.</p><span>Choose a connection<ArrowRight size={13} /></span></button></div></div></section>
        <section className="cw-start-step"><span className="cw-start-number">02</span><div><h3>Bring your project.</h3><p><FolderOpen size={14} />Import source files in Code, or start with the ready-to-edit starter. Connect a PC folder in the top bar to save your work there.</p></div></section>
        <section className="cw-start-step"><span className="cw-start-number">03</span><div><h3>Build, review, and run.</h3><p><Check size={14} />Give Vibe Coder a goal. Inspect its actions, review changes, then preview your app. You control which changes get applied.</p><div className="cw-start-shortcuts"><span><kbd>Ctrl / ⌘ K</kbd>File & action search</span><span><kbd>Ctrl / ⌘ F</kbd>Find & replace</span></div></div></section>
      </div>
      <footer><button type="button" onClick={() => { onApplyOneClickSetup(); onClose(); }}><Layers3 size={14} />Open Canvas</button><button type="button" className="cw-start-primary" onClick={() => { onLaunchCode(); onClose(); }}><Code2 size={14} />Open Code<ArrowRight size={14} /></button></footer>
    </section>
  </div>;
}
