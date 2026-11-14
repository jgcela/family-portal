import Link from 'next/link';
import { getDisplayView, getSession, getTenantOr404, tenantBase, getViewer } from '@/server/request';
import { themeToCss } from '@/server/theme/tokens';
import { exitPreviewAction } from '../preview-actions';
import { loadAuthzContext } from '@/server/rbac/context';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listPublicAnnouncements } from '@/server/services/content';
import { linkHref, linkVisibleTo, listMenuLinks } from '@/server/services/links';
import { SignOutButton } from './account/sign-out';
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

  const nav = [
    ...view.activeModules
      .filter((m) => m.nav?.area === 'primary')
      .map((m) => ({ label: m.nav!.label, href: `${base}${m.nav!.path === '/' ? '' : m.nav!.path}` || '/' })),
    ...view.customNav
      .filter((n) => n.menu === 'primary' && linkVisibleTo(n.visibility, viewer))
      .map((n) => ({ label: n.label, href: linkHref(n, base), newTab: n.opensInNewTab })),
  ];
  const headerButtons = view.activeModules.some((m) => m.id === 'quick_links') ? await listMenuLinks(tenant.id, 'header', viewer) : [];
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
        <div className="container portal-footer-inner">
          <div>
            <p className="portal-footer-name">{p.displayName}</p>
            {p.addressLine1 && (
              <p>
                {p.addressLine1}, {p.city}, {p.region} {p.postalCode}
              </p>
            )}
          </div>
          <div className="portal-footer-contact">
            {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}`}>{p.phone}</a>}
            {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
            {p.websiteUrl && <a href={p.websiteUrl}>School website</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
