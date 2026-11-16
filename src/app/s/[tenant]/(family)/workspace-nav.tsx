'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../(portal)/portal-icons';

type IconName = Parameters<typeof Icon>[0]['name'];
export type WorkspaceLink = { href: string; label: string; icon: IconName; short?: string };

// In subdomain mode the browser path has no /s/<slug> prefix; compare without it.
const norm = (p: string) => p.replace(/^\/s\/[^/]+(?=\/|$)/, '') || '/';
const isActive = (pathname: string, href: string) => {
  const p = norm(pathname);
  const h = norm(href.split('?')[0] ?? href);
  return p === h || p.startsWith(`${h}/`);
};

/** Desktop sidebar: the family's own pages, then the school portal pages. */
export function WorkspaceSidebarNav({ mine, school }: { mine: WorkspaceLink[]; school: WorkspaceLink[] }) {
  const pathname = usePathname();
  const item = (l: WorkspaceLink) => (
    <li key={l.href}>
      <Link href={l.href} className="ws-nav-item" aria-current={isActive(pathname, l.href) ? 'page' : undefined}>
        <Icon name={l.icon} size={20} />
        <span>{l.label}</span>
      </Link>
    </li>
  );
  return (
    <nav className="ws-nav" aria-label="Family workspace">
      <ul>{mine.map(item)}</ul>
      {school.length > 0 && (
        <>
          <p className="ws-nav-title">School</p>
          <ul>{school.map(item)}</ul>
        </>
      )}
    </nav>
  );
}

/** Small screens: the four or five main destinations pinned to the bottom. */
export function WorkspaceBottomNav({ links }: { links: WorkspaceLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="ws-bottom" aria-label="Family workspace shortcuts">
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={isActive(pathname, l.href) ? 'page' : undefined}>
              <Icon name={l.icon} size={22} />
              <span>{l.short ?? l.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "My family / Requests": where you are, from the same list as the sidebar. */
export function WorkspaceCrumb({ school, links }: { school: string; links: WorkspaceLink[] }) {
  const pathname = usePathname();
  const here = links.find((l) => isActive(pathname, l.href));
  return (
    <p className="ws-crumb">
      <span>{school}</span>
      <span aria-hidden="true"> / </span>
      <span className="ws-crumb-here">{here?.label ?? 'My family'}</span>
    </p>
  );
}
