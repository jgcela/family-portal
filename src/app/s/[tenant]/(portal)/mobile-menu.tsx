'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './portal-icons';

type L = { label: string; href: string; newTab?: boolean };

const Item = ({ l }: { l: L }) => (
  <li>
    <a href={l.href} {...(l.newTab ? { target: '_blank', rel: 'noopener' } : {})}>
      {l.label}
      {l.newTab && <span className="visually-hidden"> (opens in a new tab)</span>}
    </a>
  </li>
);

/**
 * Small screens: one "Menu" button that opens the sections, the separate pages
 * and the account links. Closes on a link click or Escape.
 */
export function MobileMenu({ sections, pages, account }: { sections: L[]; pages: L[]; account: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" className="menu-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? 'close' : 'menu'} />
        <span className="visually-hidden">Menu</span>
      </button>
      <nav
        id={id}
        className="mobile-menu"
        aria-label="Menu"
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        {sections.length > 0 && (
          <ul>
            {sections.map((l) => (
              <Item key={l.href + l.label} l={l} />
            ))}
          </ul>
        )}
        {pages.length > 0 && (
          <ul className="mobile-menu-sub">
            {pages.map((l) => (
              <Item key={l.href + l.label} l={l} />
            ))}
          </ul>
        )}
        <div className="mobile-menu-account">{account}</div>
      </nav>
    </>
  );
}
