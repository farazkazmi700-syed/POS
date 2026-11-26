import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, LogOut, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const developerEmail = 'developer@pos.local';

export default function DeveloperProfileMenu({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(0);

  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[initialFocus.current === -1 ? items.length - 1 : 0]?.focus({ preventScroll: true });

    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function openMenu(focus: number) {
    initialFocus.current = focus;
    setOpen(true);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        openMenu(key === 'ArrowUp' ? -1 : 0);
      }
      return;
    }
    if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      trigger.current?.focus({ preventScroll: true });
      setOpen(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;

    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const index = items.findIndex((item) => item === document.activeElement);
    const next = key === 'Home' ? 0 : key === 'End' ? items.length - 1
      : key === 'ArrowDown' ? (index + 1) % items.length
      : index <= 0 ? items.length - 1 : index - 1;
    items[next].focus({ preventScroll: true });
  }

  return (
    <div className="dev-profile" ref={root} onKeyDown={handleKey}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button type="button" className="dev-profile-trigger" ref={trigger}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => { if (open) setOpen(false); else openMenu(0); }}>
        <span className="dev-profile-avatar" aria-hidden="true">PD</span>
        <span>Platform Developer</span>
        <ChevronDown className="dev-profile-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="dev-profile-menu" id={menuId} role="menu" aria-label="Developer account" ref={menu}>
          <div className="dev-profile-info" role="presentation">
            <span className="dev-profile-avatar" aria-hidden="true">PD</span>
            <div className="min-w-0" role="presentation">
              <strong>Platform Developer</strong>
              <a className="dev-profile-email" href={`mailto:${developerEmail}`} role="menuitem" tabIndex={-1}
                onClick={() => { trigger.current?.focus(); setOpen(false); }}>{developerEmail}</a>
              <span className="dev-profile-badge">Developer Access</span>
            </div>
          </div>
          <div className="dev-profile-actions" role="presentation">
            <Link className="dev-profile-action" role="menuitem" tabIndex={-1}
              to="/recover?purpose=password&source=developer" onClick={() => setOpen(false)}>
              <Shield size={16} aria-hidden="true" /> Account Security
            </Link>
            <button className="dev-profile-action dev-profile-signout" type="button" role="menuitem" tabIndex={-1}
              onClick={() => { setOpen(false); onSignOut(); }}>
              <LogOut size={16} aria-hidden="true" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
