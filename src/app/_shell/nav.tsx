'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';

export type ShellItem = { href: string; label: string; exact?: boolean };
export type ShellGroup = { title: string; items: ShellItem[] };

// In subdomain mode the browser path has no /s/<slug> prefix; compare without it.
const norm = (p: string) => p.replace(/^\/s\/[^/]+(?=\/|$)/, '') || '/';

function isActive(pathname: string, item: ShellItem) {
  const p = norm(pathname);
  const h = norm(item.href);
  return item.exact ? p === h : p === h || p.startsWith(`${h}/`);
}

function useCloseOnRoute(close: () => void) {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}

/** Horizontal section nav: one link per single-item group, a dropdown for the rest. */
export function ShellNav({ groups, label }: { groups: ShellGroup[]; label: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  useCloseOnRoute(() => setOpen(null));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const trigger = navRef.current?.querySelector<HTMLButtonElement>(`[data-group="${CSS.escape(open)}"]`);
      setOpen(null);
      trigger?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav ref={navRef} className="shell-nav" aria-label={label}>
      <ul className="shell-nav-list">
        {groups.map((g) => {
          const active = g.items.some((i) => isActive(pathname, i));
          const only = g.items.length === 1 ? g.items[0] : undefined;
          if (only) {
            const i = only;
            return (
              <li key={g.title}>
                <Link className="shell-nav-item" href={i.href} aria-current={isActive(pathname, i) ? 'page' : undefined}>
                  {i.label}
                </Link>
              </li>
            );
          }
          const isOpen = open === g.title;
          const menuId = `shell-menu-${g.title.replace(/\W+/g, '-').toLowerCase()}`;
          return (
            <li key={g.title} className="shell-nav-group">
              <button
                type="button"
                className="shell-nav-item"
                data-group={g.title}
                data-active={active || undefined}
                aria-expanded={isOpen}
                aria-controls={menuId}
                onClick={() => setOpen(isOpen ? null : g.title)}
              >
                {g.title}
                <Icon name="chevron" size={16} className="shell-chevron" />
              </button>
              <ul id={menuId} className="shell-menu" hidden={!isOpen}>
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={isActive(pathname, i) ? 'page' : undefined}>
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Small screens: every section in one disclosure panel under the header. */
export function ShellMobileMenu({ groups, label, extra }: { groups: ShellGroup[]; label: string; extra?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const id = useId();
  useCloseOnRoute(() => setOpen(false));
  return (
    <>
      <button
        type="button"
        className="shell-icon-btn shell-menu-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'close' : 'menu'} />
        <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
      </button>
      <nav id={id} className="shell-mobile" aria-label={label} hidden={!open}>
        {groups.map((g) => (
          <div key={g.title}>
            {g.items.length > 1 && <h2>{g.title}</h2>}
            <ul>
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} aria-current={isActive(pathname, i) ? 'page' : undefined}>
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {extra}
      </nav>
    </>
  );
}

/** "Go to…" box: filters the sections this person can open and jumps there. ⌘K / Ctrl+K focuses it. */
export function QuickJump({ groups }: { groups: ShellGroup[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const all = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.items.length > 1 ? g.title : '' }))),
    [groups],
  );
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all.slice(0, 8);
    return all.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, all]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    router.push(href);
  };

  const showList = open && matches.length > 0;
  return (
    <div className="shell-search">
      <Icon name="search" size={18} className="shell-search-icon" />
      <label htmlFor={`${listId}-input`} className="visually-hidden">
        Go to a section
      </label>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${cursor}` : undefined}
        autoComplete="off"
        placeholder="Go to…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter' && matches[cursor]) {
            e.preventDefault();
            go(matches[cursor].href);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <kbd className="shell-kbd" aria-hidden="true">
        ⌘K
      </kbd>
      <ul id={listId} role="listbox" className="shell-search-list" hidden={!showList} aria-label="Sections">
        {matches.map((m, n) => (
          <li
            key={m.href}
            id={`${listId}-${n}`}
            role="option"
            aria-selected={n === cursor}
            onMouseDown={(e) => {
              e.preventDefault();
              go(m.href);
            }}
            onMouseEnter={() => setCursor(n)}
          >
            <span>{m.label}</span>
            {m.group && <span className="shell-search-group">{m.group}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
