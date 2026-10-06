import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, X } from 'lucide-react';
import type { AgentSpecialization, CanvasCard } from '../../types/canvas';
import { AGENT_SPECIALIZATIONS, getAgentIdentity, normalizeAgentIdentity } from '../../utils/agentIdentity';
import './agentIdentity.css';

export function AgentIdentityEditor({ card, onSave, onClose }: { card: CanvasCard; onSave: (update: Partial<CanvasCard>) => void; onClose: () => void }) {
  const identity = getAgentIdentity(card);
  const [name, setName] = useState(identity.name);
  const [specialization, setSpecialization] = useState<AgentSpecialization>(identity.specialization);
  const [role, setRole] = useState(identity.specialization === 'custom' ? identity.role : '');
  const [instructions, setInstructions] = useState(identity.instructions);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  const preset = AGENT_SPECIALIZATIONS.find(item => item.id === specialization)!;
  return createPortal(<dialog ref={dialog} className="agent-identity-dialog" aria-labelledby={`agent-identity-title-${card.id}`} onPointerDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <form className="agent-identity-form" onSubmit={event => { event.preventDefault(); try { onSave(normalizeAgentIdentity({ name, specialization, role, instructions })); onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update agent.'); } }}>
      <header><span className="agent-identity-icon"><Bot size={20} /></span><div><span className="agent-identity-eyebrow">YOUR TEAM</span><h2 id={`agent-identity-title-${card.id}`}>Agent identity</h2></div><button type="button" aria-label="Close agent identity" onClick={onClose}><X size={18} /></button></header>
      <p className="agent-identity-intro">Give this agent a name and a clear focus. Its specialization guides every new task.</p>
      <label>Agent name<input autoFocus value={name} maxLength={60} placeholder="e.g. Mary or Josh" onChange={event => setName(event.target.value)} required /></label>
      <label>Specialization<select value={specialization} onChange={event => setSpecialization(event.target.value as AgentSpecialization)}>{AGENT_SPECIALIZATIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="agent-identity-hint">{preset.description}</span></label>
      {specialization === 'custom' && <label>Custom role<input value={role} maxLength={80} placeholder="e.g. Game developer" onChange={event => setRole(event.target.value)} required /></label>}
      <label>Additional instructions <span className="agent-identity-optional">Optional</span><textarea value={instructions} maxLength={4000} rows={4} placeholder="e.g. Prefer accessible controls, restrained motion, and complete source files." onChange={event => setInstructions(event.target.value)} /><span className="agent-identity-hint">Saved with this workspace. Provider credentials and model selection stay in Settings.</span></label>
      {error && <p className="agent-identity-error" role="alert">{error}</p>}
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="agent-identity-save"><Check size={15} />Save agent</button></footer>
    </form>
  </dialog>, document.querySelector('.cw-app') || document.body);
}
