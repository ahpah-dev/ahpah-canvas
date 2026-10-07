import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Code2, FileText, Globe, Plus, Radio, Search, Sparkles, Terminal, X } from 'lucide-react';
import type { AgentType, CardType } from '../../types/canvas';
import { loadGatewayConfig } from '../../utils/gateways';

interface Props {
  onAdd: (type: CardType, agentType?: AgentType, providerId?: string) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function AddCardMenu({ onAdd, onClose, onOpenSettings }: Props) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [providers] = useState(() => loadGatewayConfig().customProviders ?? []);
  useEffect(() => { search.current?.focus(); }, []);
  const options = [
    { id: 'omniroute', group: 'CODING AGENTS', name: 'OmniRoute agent', description: 'Your gateway’s current models', icon: Radio, select: () => onAdd('agent', 'omniroute') },
    { id: 'kilo', group: 'CODING AGENTS', name: 'Kilo Auto Free', description: 'Dynamic free model routing', icon: Sparkles, select: () => onAdd('agent', 'kilo') },
    { id: 'codex', group: 'CODING AGENTS', name: 'Codex agent', description: 'Use your ChatGPT subscription', icon: Code2, select: () => onAdd('agent', 'codex') },
    ...providers.map(provider => ({ id: `custom:${provider.id}`, group: 'YOUR MODELS', name: provider.name, description: provider.model || 'Choose a model in Settings', icon: Radio, select: () => onAdd('agent', 'custom', provider.id) })),
    { id: 'note', group: 'PROJECT CONTEXT', name: 'Project notes', description: 'Ideas, decisions, and checklists', icon: FileText, select: () => onAdd('note') },
    { id: 'browser', group: 'PROJECT CONTEXT', name: 'Browser preview', description: 'A real embedded web page', icon: Globe, select: () => onAdd('browser') },
    { id: 'terminal', group: 'PROJECT CONTEXT', name: 'Command scratchpad', description: 'Keep commands close to your work', icon: Terminal, select: () => onAdd('terminal') },
  ];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = options.filter(option => terms.every(term => `${option.name} ${option.description} ${option.group}`.toLowerCase().includes(term)));

  return <div ref={root} id="cw-add-card-dialog" className="cw-add-menu cw-card-directory" role="dialog" aria-label="Add a canvas card" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Enter' && event.target === search.current && visible[0]) { event.preventDefault(); visible[0].select(); }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-card-option]') ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === 0 && event.key === 'ArrowUp') search.current?.focus();
    else buttons[event.key === 'ArrowDown' ? Math.min(current + 1, buttons.length - 1) : Math.max(0, current - 1)]?.focus();
  }}>
    <div className="cw-menu-heading">Add to your canvas<button type="button" aria-label="Close add menu" onClick={onClose}><X size={15} /></button></div>
    <label className="cw-card-menu-search"><Search size={14} aria-hidden="true" /><input ref={search} type="search" aria-label="Search cards and models" placeholder="Find an agent, model, or tool…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="cw-card-menu-options">
      {visible.map((option, index) => <div key={option.id}>
        {visible[index - 1]?.group !== option.group && <span className="cw-menu-category">{option.group}</span>}
        <button type="button" data-card-option onClick={option.select}><span className="cw-icon-tile"><option.icon size={17} /></span><span><strong>{option.name}</strong><small>{option.description}</small></span><Plus size={13} /></button>
      </div>)}
      {!visible.length && <div className="cw-card-menu-empty" role="status"><Search size={20} /><strong>No cards match “{query}”</strong><button type="button" onClick={() => { setQuery(''); search.current?.focus(); }}>Clear search</button></div>}
    </div>
    <footer><span>↑ ↓ navigate · Enter to add</span><button type="button" onClick={onOpenSettings}>Connect models<ArrowRight size={12} /></button></footer>
  </div>;
}
