import Link from 'next/link';
import { Icon } from './icons';
import { QuickJump, ShellMobileMenu, ShellNav, type ShellGroup } from './nav';
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
 * header with search and account, horizontal section nav, then the page on a
 * white sheet that overlaps a soft colour band.
 */
export function AdminShell({ mark, title, subtitle, groups, navLabel, userName, userDetail, portalHref, banner, children }: Props) {
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

  return (
    <div className="admin shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-top">
        <div className="shell-wrap shell-bar">
          <div className="shell-brand">
            <span className={`shell-mark shell-mark-${mark.tone ?? 'brand'}`} aria-hidden="true">
              {mark.text}
            </span>
            <span className="shell-brand-text">
              <span className="shell-brand-name">{title}</span>
              {subtitle && <span className="shell-brand-sub">{subtitle}</span>}
            </span>
          </div>
          <QuickJump groups={groups} />
          <div className="shell-actions">
            {portalLink}
            <span className="shell-user" title={userDetail ? `${userName} · ${userDetail}` : userName}>
              <span className="shell-avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="shell-user-text">
                <span className="shell-user-hi">Hi, {first}</span>
                {userDetail && <span className="shell-user-detail">{userDetail}</span>}
              </span>
            </span>
            <ShellMobileMenu groups={groups} label={navLabel} extra={portalLink} />
          </div>
        </div>
        <div className="shell-wrap">
          <ShellNav groups={groups} label={navLabel} />
        </div>
      </header>
      <main id="main" className="shell-main">
        <div className="shell-wrap">
          <div className="shell-sheet admin-main">
            {banner}
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export type { ShellGroup };
