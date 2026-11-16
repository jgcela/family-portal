// The signed-in family's private workspace (My family, requests, absences, assistant):
// a calm app layout with a sidebar on large screens and a bottom bar on phones.
// Colours come from the school's theme tokens, so every school sees its own brand.
// Anyone who is not signed in as a family gets the public portal layout instead,
// so those pages can still show their "Sign in" message.
import Link from 'next/link';
import { getDisplayView, getSession, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { themeToCss } from '@/server/theme/tokens';
import { assistantAvailableFor } from '@/server/services/assistant';
import { familyAssistantAvailable } from '@/server/services/family-assistant';
import PortalLayout from '../(portal)/layout';
import { AccountMenu } from '@/app/_account/account-menu';
import { WorkspaceBottomNav, WorkspaceCrumb, WorkspaceSidebarNav, type WorkspaceLink } from './workspace-nav';
import '../portal.css';
import './workspace.css';
import '@/app/_account/account.css';

type Props = { children: React.ReactNode; params: Promise<{ tenant: string }> };

export default async function FamilyWorkspaceLayout({ children, params }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const viewer = await getViewer(tenant.id);
  if (viewer.kind !== 'family') return <PortalLayout params={params}>{children}</PortalLayout>;

  const [view, base, session] = await Promise.all([getDisplayView(tenant.id), tenantBase(key), getSession()]);
  const active = new Set(view.activeModules.map((m) => m.id));
  const [canAsk, hasAssistant] = await Promise.all([assistantAvailableFor(tenant.id, viewer, [...active]), familyAssistantAvailable(tenant.id, viewer)]);
  const p = view.profile;
  const school = p.shortName ?? p.displayName;
  const logo = view.theme.logo.primary;
  const name = session?.user.name ?? '';

  const home: WorkspaceLink = { href: `${base}/family`, label: 'Home', icon: 'home' };
  const ask: WorkspaceLink[] = hasAssistant
    ? [{ href: `${base}/assistant`, label: 'Ask', icon: 'spark' }]
    : canAsk
      ? [{ href: `${base}/ask`, label: 'Ask', icon: 'spark' }]
      : [];
  const requests: WorkspaceLink[] = active.has('operations_inbox') ? [{ href: `${base}/requests`, label: 'Requests', icon: 'inbox' }] : [];
  const absence: WorkspaceLink[] = active.has('attendance_notices') ? [{ href: `${base}/absence`, label: 'Report an absence', short: 'Absence', icon: 'absence' }] : [];
  const calendar: WorkspaceLink[] = active.has('calendar') ? [{ href: `${base}/calendar`, label: 'Calendar', icon: 'calendar' }] : [];
  const schoolLinks: WorkspaceLink[] = [
    ...calendar,
    ...(active.has('announcements') ? [{ href: `${base}/updates`, label: 'Updates', icon: 'mail' as const }] : []),
    ...(active.has('documents') ? [{ href: `${base}/documents`, label: 'Documents', icon: 'doc' as const }] : []),
    ...(active.has('volunteer') ? [{ href: `${base}/volunteer`, label: 'Volunteer', icon: 'heart' as const }] : []),
    { href: base || '/', label: 'School portal', icon: 'school' },
  ];
  const settings: WorkspaceLink = { href: `${base}/settings`, label: 'Settings', icon: 'users' };
  const mine = [home, ...ask, ...requests, ...absence];
  const bottom = [home, ...ask, ...calendar, ...requests, ...absence].slice(0, 5);

  return (
    <div className="portal ws">
      {view.preview?.theme && <style dangerouslySetInnerHTML={{ __html: themeToCss(view.theme) }} />}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="ws-side">
        <Link href={`${base}/family`} className="ws-brand">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${p.displayName}`} className="ws-logo" />
          ) : (
            <span className="ws-wordmark">{school}</span>
          )}
          <span className="ws-brand-sub">Your family&rsquo;s school space</span>
        </Link>
        <WorkspaceSidebarNav mine={mine} school={schoolLinks} />
        <div className="ws-side-foot">
          {p.phone && (
            <p>
              Office: <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>
            </p>
          )}
          {p.officeHours && <p>{p.officeHours}</p>}
        </div>
      </aside>
      <div className="ws-body">
        <header className="ws-top">
          <Link href={`${base}/family`} className="ws-top-brand">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`${p.displayName} · My family`} className="ws-logo-sm" />
            ) : (
              <span className="ws-wordmark">{school}</span>
            )}
          </Link>
          <WorkspaceCrumb school={school} links={[...mine, ...schoolLinks, settings]} />
          <div className="ws-top-right">
            <AccountMenu
              name={name}
              email={session?.user.email ?? ''}
              image={session?.user.image}
              settingsHref={`${base}/settings`}
              links={[{ href: base || '/', label: 'School portal' }]}
              signOutTo={base || '/'}
            />
          </div>
        </header>
        <main id="main" className="ws-main">
          {children}
        </main>
      </div>
      <WorkspaceBottomNav links={bottom} />
    </div>
  );
}
