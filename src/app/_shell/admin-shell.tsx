import Link from 'next/link';
import { Icon } from './icons';
import { QuickJump, ShellCrumb, ShellMobileMenu, ShellSideNav, type ShellGroup } from './nav';
import './shell.css';

type Props = {
  /** Square mark next to the name: the school's initials in its own colour, or the platform's letter. */
  mark: { text: string; tone?: 'brand' | 'ink' };
  title: string;
  subtitle?: string;
  groups: ShellGroup[];
  navLabel: string;
  userName: string;
  userDetail?: string;
  portalHref?: string;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Back-office chrome shared by the school admin and the platform (Super Admin):
 * a sidebar with every section on large screens, a slim top bar with where you
 * are, the "Go to…" search and the account, then the page on a calm white canvas.
 * The school admin takes its accent from the school's theme; the platform uses ink.
 */
export function AdminShell({ mark, title, subtitle, groups, navLabel, userName, userDetail, portalHref, banner, children }: Props) {
  const tone = mark.tone ?? 'brand';
  const first = userName.split(/\s+/)[0] || userName;
  const initials = userName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const portalLink = portalHref ? (
    <Link className="shell-portal" href={portalHref}>
      View family portal
      <Icon name="external" size={16} />
    </Link>
  ) : null;
  const brand = (
    <span className="shell-brand">
      <span className={`shell-mark shell-mark-${tone}`} aria-hidden="true">
        {mark.text}
      </span>
      <span className="shell-brand-text">
        <span className="shell-brand-name">{title}</span>
        {subtitle && <span className="shell-brand-sub">{subtitle}</span>}
      </span>
    </span>
  );

  return (
    <div className={`admin shell shell-tone-${tone}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="shell-side">
        {brand}
        <ShellSideNav groups={groups} label={navLabel} />
        {portalLink && <div className="shell-side-foot">{portalLink}</div>}
      </aside>
      <div className="shell-body">
        <header className="shell-top">
          <div className="shell-top-brand">{brand}</div>
          <ShellCrumb groups={groups} />
          <QuickJump groups={groups} />
          <div className="shell-actions">
            <span className="shell-user" title={userDetail ? `${userName} · ${userDetail}` : userName}>
              <span className="shell-avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="shell-user-text">
                <span className="shell-user-hi">{first}</span>
                {userDetail && <span className="shell-user-detail">{userDetail}</span>}
              </span>
            </span>
            <ShellMobileMenu groups={groups} label={navLabel} extra={portalLink} />
          </div>
        </header>
        <main id="main" className="shell-main">
          <div className="shell-sheet admin-main">
            {banner}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export type { ShellGroup };
