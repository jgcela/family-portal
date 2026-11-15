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
import { MobileMenu } from './mobile-menu';
import { defaultTopLinks, modulePages, sectionLinks, visibleBlocks, type NavLink } from '@/server/tenancy/portal-nav';
import '../portal.css';

/** A menu link: in-portal links are plain anchors so #section jumps work from any page. */
function NavA({ l }: { l: NavLink }) {
  return (
    <a href={l.href} {...(l.newTab ? { target: '_blank', rel: 'noopener' } : {})}>
      {l.label}
      {l.newTab && <span className="visually-hidden"> (opens in a new tab)</span>}
    </a>
  );
}

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

  const active = new Set(view.activeModules.map((m) => m.id));
  const hasLinks = active.has('quick_links');
  const [headerButtons, topLinks, canAsk, hasAssistant] = await Promise.all([
    hasLinks ? listMenuLinks(tenant.id, 'header', viewer) : [],
    hasLinks ? listMenuLinks(tenant.id, 'top', viewer) : [],
    assistantAvailableFor(tenant.id, viewer, [...active]),
    familyAssistantAvailable(tenant.id, viewer),
  ]);
  // Families with the private assistant use it instead of the plain Q&A page (it searches the same sources).
  const ask = hasAssistant ? [{ label: 'Assistant', href: `${base}/assistant` }] : canAsk ? [{ label: 'Ask', href: `${base}/ask` }] : [];
  const hasContact = !!(p.phone || p.email || p.officeHours);
  // Main menu: jumps to the homepage sections (This week, Documents, Calendar, Contact),
  // plus any links the school added to the Main menu.
  const sections = [
    ...sectionLinks(visibleBlocks(view.homepage, active), active, base, hasContact),
    ...view.customNav
      .filter((n) => n.menu === 'primary' && linkVisibleTo(n.visibility, viewer))
      .map((n) => ({ label: n.label, href: linkHref(n, base), newTab: n.opensInNewTab })),
  ];
  // Top bar: separate pages. The school's own Top bar links, or the module pages when it has none.
  const pages = topLinks.length
    ? topLinks.map((l) => ({ label: l.label, href: linkHref(l, base), newTab: l.opensInNewTab }))
    : [...defaultTopLinks(view.activeModules, base), ...ask];
  // Footer: every page, so nothing is out of reach when the top bar is short.
  const explore = [...modulePages(view.activeModules, base), ...ask];
  const tel = p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}` : null;
  const logo = view.theme.header === 'solid' ? view.theme.logo.onDark ?? view.theme.logo.primary : view.theme.logo.primary;

  const account = isStaff ? (
    <>
      <Link href={`${base}/admin`}>Manage portal</Link>
      <SignOutButton to={base || '/'} />
    </>
  ) : session ? (
    <>
      {viewer.kind === 'family' ? <Link href={`${base}/family`}>My family</Link> : <span className="portal-user">{session.user.name}</span>}
      <SignOutButton to={base || '/'} />
    </>
  ) : (
    <Link href={`${base}/login`}>Sign in</Link>
  );

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
      <div className="portal-masthead">
        <div className="top-bar">
          <div className="container top-bar-inner">
            {pages.length > 0 && (
              <nav aria-label="More pages" className="top-bar-pages">
                <ul>
                  {pages.map((l) => (
                    <li key={l.href + l.label}>
                      <NavA l={l} />
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className="top-bar-account">{account}</div>
          </div>
        </div>
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
            {sections.length > 0 && (
              <nav aria-label="Portal sections" className="portal-nav">
                <ul>
                  {sections.map((l) => (
                    <li key={l.href + l.label}>
                      <NavA l={l} />
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className="portal-actions">
              {headerButtons.map((b) => (
                <a
                  key={b.id}
                  href={linkHref(b, base)}
                  className="btn btn-accent portal-header-link"
                  {...(b.opensInNewTab ? { target: '_blank', rel: 'noopener' } : {})}
                >
                  {b.label}
                  {b.opensInNewTab && (
                    <>
                      <Icon name="external" size={18} />
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </>
                  )}
                </a>
              ))}
              <MobileMenu sections={sections} pages={pages} account={account} />
            </div>
          </div>
        </header>
      </div>
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
      <footer className="portal-footer" id="contact">
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
          {explore.length > 0 && (
            <nav aria-label="All pages" className="footer-pages">
              <ul>
                {explore.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
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
