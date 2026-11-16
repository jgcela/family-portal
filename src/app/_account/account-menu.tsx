'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Avatar } from './avatar';

type MenuLink = { href: string; label: string; newTab?: boolean };

/**
 * Account button (avatar + name) with a small menu: who you are, Settings,
 * any extra links, and Sign out. Same component in the family workspace,
 * the school admin and the platform.
 */
export function AccountMenu({
  name,
  email,
  image,
  detail,
  settingsHref,
  links = [],
  signOutTo,
}: {
  name: string;
  email: string;
  image?: string | null;
  detail?: string;
  settingsHref: string;
  links?: MenuLink[];
  signOutTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pathname = usePathname();
  const first = name.split(/\s+/)[0] || name;

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="acct" ref={ref}>
      <button ref={btnRef} type="button" className="acct-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Avatar name={name} image={image} />
        <span className="acct-btn-text">
          <span className="acct-btn-name">{first}</span>
          {detail && <span className="acct-btn-detail">{detail}</span>}
        </span>
        <svg className="acct-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className="visually-hidden">Account menu</span>
      </button>
      <div id={id} className="acct-menu" hidden={!open}>
        <div className="acct-who">
          <Avatar name={name} image={image} size={40} />
          <span>
            <strong>{name}</strong>
            <small>{email}</small>
          </span>
        </div>
        <ul>
          <li>
            <Link href={settingsHref}>Settings</Link>
          </li>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} {...(l.newTab ? { target: '_blank', rel: 'noopener' } : {})}>
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="acct-signout"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                await authClient.signOut();
                window.location.assign(signOutTo);
              }}
            >
              {leaving ? 'Signing out…' : 'Sign out'}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
