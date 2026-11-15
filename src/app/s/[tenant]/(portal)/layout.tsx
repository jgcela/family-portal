import Link from 'next/link';
import { getDisplayView, getSession, getTenantOr404, tenantBase, getViewer } from '@/server/request';
import { themeToCss } from '@/server/theme/tokens';
import { exitPreviewAction } from '../preview-actions';
import { loadAuthzContext } from '@/server/rbac/context';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listPublicAnnouncements } from '@/server/services/content';
import { linkHref, linkVisibleTo, listMenuLinks } from '@/server/services/links';
import { assistantAvailableFor } from '@/server/services/assistant';
import { familyAssistantAvailable } from '@/server/services/family-assistant';
import { SignOutButton } from './account/sign-out';
import { Icon } from './portal-icons';
import '../portal.css';

type Props = { children: React.ReactNode; params: Promise<{ tenant: string }> };

export default async function PortalLayout({ children, params }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, base, session] = await Promise.all([getDisplayView(tenant.id), tenantBase(key), getSession()]);
  const ctx = session ? await loadAuthzContext(tenant.id, session.user.id) : null;
  const isStaff = hasAnywhere(ctx, 'dashboard.view');
  const viewer = await getViewer(tenant.id);
  const p = view.profile;
  const urgent = view.activeModules.some((m) => m.id === 'announcements')
    ? (await listPublicAnnouncements(tenant.id, await getViewer(tenant.id), { limit: 3 })).filter((x) => x.isUrgent)
    : [];

  const hasLinks = view.activeModules.some((m) => m.id === 'quick_links');
  const [headerButtons, topLinks] = hasLinks ? await Promise.all([listMenuLinks(tenant.id, 'header', viewer), listMenuLinks(tenant.id, 'top', viewer)]) : [[], []];
  // A page already linked from the top bar is not repeated in the main menu.
  const inTopBar = new Set(topLinks.filter((l) => l.kind === 'page').map((l) => l.target.split(/[?#]/)[0]));
  const nav = [
    ...view.activeModules
      .filter((m) => m.nav?.area === 'primary' && !inTopBar.has(m.nav.path))
      .map((m) => ({ label: m.nav!.label, href: `${base}${m.nav!.path === '/' ? '' : m.nav!.path}` || '/' })),
    // Families with the private assistant use it instead of the plain Q&A page (it searches the same sources).
    ...((await familyAssistantAvailable(tenant.id, viewer))
      ? [{ label: 'Assistant', href: `${base}/assistant` }]
      : (await assistantAvailableFor(tenant.id, viewer, view.activeModules.map((m) => m.id)))
        ? [{ label: 'Ask', href: `${base}/ask` }]
        : []),
    // Signed-in families: report an absence and follow their requests.
    ...(viewer.kind === 'family' && view.activeModules.some((m) => m.id === 'attendance_notices') ? [{ label: 'Report an absence', href: `${base}/absence` }] : []),
    ...(viewer.kind === 'family' && view.activeModules.some((m) => m.id === 'operations_inbox') ? [{ label: 'My requests', href: `${base}/requests` }] : []),
    ...view.customNav
      .filter((n) => n.menu === 'primary' && linkVisibleTo(n.visibility, viewer))
      .map((n) => ({ label: n.label, href: linkHref(n, base), newTab: n.opensInNewTab })),
  ];
  const tel = p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}` : null;
  const logo = view.theme.header === 'solid' ? view.theme.logo.onDark ?? view.theme.logo.primary : view.theme.logo.primary;

  return (
    <div className={`portal portal-header-${view.theme.header}`}>
      {view.preview?.theme && (
        // Draft tokens pass the same schema as published ones, so this is safe to inline.
        <style dangerouslySetInnerHTML={{ __html: themeToCss(view.theme) }} />
      )}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {view.preview && (
        <div className="preview-banner" role="region" aria-label="Preview">
          <div className="container preview-banner-inner">
            <p>
              <strong>Preview.</strong> You are seeing unpublished changes
              {view.preview.theme && view.preview.homepage ? ' to the theme and homepage' : view.preview.theme ? ' to the theme' : view.preview.homepage ? ' to the homepage' : ''}
              {!view.preview.theme && !view.preview.homepage ? ' (there are no drafts right now)' : ''}. Families still see the published version.
            </p>
            <form action={exitPreviewAction.bind(null, key)}>
              <button type="submit" className="btn btn-sm">
                Exit preview
              </button>
            </form>
          </div>
        </div>
      )}
      {topLinks.length > 0 && (
        <nav className="top-bar" aria-label="More">
          <ul className="container top-bar-inner">
            {topLinks.map((l) => (
              <li key={l.id}>
                <a href={linkHref(l, base)} {...(l.opensInNewTab ? { target: '_blank', rel: 'noopener' } : {})}>
                  {l.label}
                  {l.opensInNewTab && <span className="visually-hidden"> (opens in a new tab)</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <header className="portal-header">
        <div className="container portal-header-inner">
          <Link href={base || '/'} className="portal-brand">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`${p.displayName} home`} className="portal-logo" />
            ) : (
              <span className="portal-wordmark">{p.shortName ?? p.displayName}</span>
            )}
          </Link>
          <nav aria-label="Main" className="portal-nav">
            <ul>
              {nav.map((n) => (
                <li key={n.href + n.label}>
                  {'newTab' in n && n.newTab ? (
                    <a href={n.href} target="_blank" rel="noopener">
                      {n.label}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <Link href={n.href}>{n.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="portal-account">
            {headerButtons.map((b) =>
              b.opensInNewTab ? (
                <a key={b.id} href={linkHref(b, base)} className="btn btn-accent portal-header-link" target="_blank" rel="noopener">
                  {b.label}
                  <Icon name="external" size={18} />
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              ) : (
                <a key={b.id} href={linkHref(b, base)} className="btn btn-accent portal-header-link">
                  {b.label}
                </a>
              ),
            )}
            {isStaff ? (
              <>
                <Link href={`${base}/admin`} className="btn btn-accent">
                  Manage portal
                </Link>
                <SignOutButton to={base || '/'} />
              </>
            ) : session ? (
              <>
                {viewer.kind === 'family' ? (
                  <Link href={`${base}/family`} className="portal-signin">
                    My family
                  </Link>
                ) : (
                  <span className="portal-user">{session.user.name}</span>
                )}
                <SignOutButton to={base || '/'} />
              </>
            ) : (
              <Link href={`${base}/login`} className="portal-signin">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      {urgent.length > 0 && (
        <div className="urgent-banner" role="region" aria-label="Urgent announcements">
          <div className="container">
            {urgent.map((u) => (
              <p key={u.id}>
                <span className="urgent-tag">Urgent</span> <Link href={`${base}/updates/${u.id}`}>{u.title}</Link>
              </p>
            ))}
          </div>
        </div>
      )}
      <main id="main">{children}</main>
      <footer className="portal-footer">
        <div className="container">
          {(p.phone || p.email || p.officeHours) && (
            <>
              <p className="footer-eyebrow">Need help?</p>
              <p className="footer-title">We&rsquo;re here for your family.</p>
              <ul className="footer-cards">
                {p.phone && (
                  <li>
                    <span className="footer-card-label">Call the office</span>
                    <a href={tel!}>{p.phone}</a>
                  </li>
                )}
                {p.email && (
                  <li>
                    <span className="footer-card-label">Email</span>
                    <a href={`mailto:${p.email}`}>{p.email}</a>
                  </li>
                )}
                {p.officeHours && (
                  <li>
                    <span className="footer-card-label">Office hours</span>
                    <strong>{p.officeHours}</strong>
                  </li>
                )}
              </ul>
            </>
          )}
          <p className="footer-legal">
            {p.displayName}
            {p.city && ` · ${p.city}${p.region ? `, ${p.region}` : ''}`}
            {p.websiteUrl && (
              <>
                {' · '}
                <a href={p.websiteUrl}>School website</a>
              </>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
