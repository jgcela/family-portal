import Link from 'next/link';
import { getPortalView, getSession, getTenantOr404, tenantBase } from '@/server/request';
import { loadAuthzContext } from '@/server/rbac/context';
import { hasAnywhere } from '@/server/rbac/authorize';
import '../portal.css';

type Props = { children: React.ReactNode; params: Promise<{ tenant: string }> };

export default async function PortalLayout({ children, params }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, base, session] = await Promise.all([getPortalView(tenant.id), tenantBase(key), getSession()]);
  const ctx = session ? await loadAuthzContext(tenant.id, session.user.id) : null;
  const isStaff = hasAnywhere(ctx, 'dashboard.view');
  const p = view.profile;

  const nav = [
    ...view.activeModules
      .filter((m) => m.nav?.area === 'primary')
      .map((m) => ({ label: m.nav!.label, href: `${base}${m.nav!.path === '/' ? '' : m.nav!.path}` || '/' })),
    ...view.customNav
      .filter((n) => n.visibility === 'public' || session)
      .map((n) => ({ label: n.label, href: n.kind === 'url' ? n.target : `${base}${n.target}` })),
  ];
  const logo = view.theme.header === 'solid' ? view.theme.logo.onDark ?? view.theme.logo.primary : view.theme.logo.primary;

  return (
    <div className={`portal portal-header-${view.theme.header}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
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
                  <Link href={n.href}>{n.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="portal-account">
            {isStaff ? (
              <Link href={`${base}/admin`} className="btn btn-accent">
                Manage portal
              </Link>
            ) : session ? (
              <span className="portal-user">{session.user.name}</span>
            ) : (
              <Link href={`${base}/login`} className="portal-signin">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
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
