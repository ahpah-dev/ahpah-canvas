import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

export interface ProjectMenuItem {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
}

export function ProjectMenu({ items, dismiss }: { items: ProjectMenuItem[]; dismiss: boolean }) {
  const [requestedOpen, setOpen] = useState(false);
  const open = requestedOpen && !dismiss;
  if (requestedOpen && dismiss) setOpen(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  return <div className="eng-project-menu" ref={root} onKeyDown={event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') close(false);
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (current + 1) % buttons.length : current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>
    <button type="button" ref={trigger} className="eng-button eng-icon-button" aria-label="More project actions" title="More project actions" aria-haspopup="menu" aria-expanded={open} onClick={() => {
      if (open) { close(); return; }
      setOpen(true);
      requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    }}><MoreHorizontal size={17} /></button>
    {open && <div ref={menu} className="eng-project-menu-panel" role="menu" aria-label="Project actions">
      <span className="eng-menu-label">PROJECT ACTIONS</span>
      {items.map(item => <button type="button" key={item.id} role="menuitem" disabled={item.disabled} onClick={() => { close(); item.onSelect(); }}><item.icon size={15} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>)}
    </div>}
  </div>;
}
