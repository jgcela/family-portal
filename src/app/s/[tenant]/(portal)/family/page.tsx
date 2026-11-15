// "My family": the signed-in family's dashboard. What they can do (report an
// absence, contact the office, ask), what they sent, and what is coming up for
// their grades. Only portal content and the family's own requests; no student
// records (grades, attendance history) — those live in the school's system.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalView, getSession, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { listAudiences, listPublicOccurrences } from '@/server/services/calendar';
import { listPublicAnnouncements } from '@/server/services/content';
import { listPublicDocuments } from '@/server/services/documents';
import { myRequests } from '@/server/services/inbox';
import { assistantAvailableFor } from '@/server/services/assistant';
import { CALENDAR_ALERT_DEFAULTS } from '@/server/tenancy/homepage-defaults';
import { addDays, toDateStr } from '@/server/calendar/time';
import { WeekAgenda } from '../calendar/week-agenda';
import { AnnouncementList } from '../updates/announcement-list';
import { fileLabel, formatBytes } from '../../admin/documents/shared';
import { ITEM_STATUS, KIND, NOTICE_STATUS } from '../requests/labels';
import { Icon } from '../portal-icons';
import { PasswordForm } from './password-form';

export const metadata = { title: 'My family' };
export const dynamic = 'force-dynamic';

type Action = { href: string; icon: Parameters<typeof Icon>[0]['name']; title: string; text: string; primary?: boolean };

export default async function MyFamily({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const base = await tenantBase(key);
  const viewer = await getViewer(tenant.id);
  if (viewer.kind !== 'family') redirect(`${base}/account`);
  const [view, session, audiences] = await Promise.all([getPortalView(tenant.id), getSession(), listAudiences(tenant.id)]);
  const active = new Set(view.activeModules.map((m) => m.id));
  const mine = new Set(viewer.audienceIds);
  const gradeAudiences = audiences.filter((a) => a.kind === 'grade' && mine.has(a.id));
  const forMe = (ids: string[]) => ids.length > 0 && ids.some((id) => mine.has(id));
  const today = toDateStr(new Date(), tenant.timezone);

  const [events, updates, docs, requests, canAsk] = await Promise.all([
    active.has('calendar') ? listPublicOccurrences(tenant.id, viewer, { from: today, to: addDays(today, 13) }, { audienceIds: [...viewer.audienceIds] }) : [],
    active.has('announcements') ? listPublicAnnouncements(tenant.id, viewer, { audienceIds: [...viewer.audienceIds], limit: 30 }) : [],
    active.has('documents') ? listPublicDocuments(tenant.id, viewer) : [],
    active.has('operations_inbox') ? myRequests(tenant.id, viewer) : [],
    assistantAvailableFor(tenant.id, viewer, [...active]),
  ]);
  // Events: the query already keeps whole-school events plus this family's grades.
  // Updates and documents: only what is aimed at this family (their grades, or family-only items).
  const myUpdates = updates.filter((u) => forMe(u.audienceIds) || u.visibility === 'families');
  const myDocs = docs.filter((d) => forMe(d.audienceIds) || d.visibility === 'families');
  // "No school" style pills, from the school's Calendar alert blocks.
  const alertCategories = view.homepage
    .filter((b) => b.type === 'calendar-alert' && b.enabled)
    .map((b) => (typeof b.settings.category === 'string' && b.settings.category.trim() ? b.settings.category : CALENDAR_ALERT_DEFAULTS.category).trim().toLowerCase());
  const firstName = session?.user.name.split(' ')[0];
  const openRequests = requests.filter((r) => ['new', 'in_progress', 'waiting'].includes(r.status));
  const waiting = requests.filter((r) => r.status === 'waiting').length;
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: tenant.timezone });

  const actions: Action[] = [
    ...(active.has('attendance_notices')
      ? [{ href: `${base}/absence`, icon: 'absence' as const, title: 'Report an absence', text: 'Tell the office your child will be out, late or leaving early.', primary: true }]
      : []),
    ...(active.has('operations_inbox')
      ? [
          {
            href: `${base}/requests`,
            icon: 'inbox' as const,
            title: 'My requests',
            text: openRequests.length ? `${openRequests.length} open${waiting ? `, ${waiting} waiting for you` : ''}.` : 'Follow what you sent to the office.',
          },
          { href: `${base}/requests?new=1`, icon: 'mail' as const, title: 'Contact the office', text: 'Send a question or a request and get a reference number.' },
        ]
      : []),
    ...(canAsk ? [{ href: `${base}/ask`, icon: 'chat' as const, title: 'Ask a question', text: 'Get answers from the school’s handbook and documents.' }] : []),
    ...(active.has('volunteer') ? [{ href: `${base}/volunteer`, icon: 'heart' as const, title: 'Volunteer', text: 'See where the school needs a hand.' }] : []),
  ];

  return (
    <div className="family-page">
      <section className="family-hero" aria-labelledby="fam-title">
        <div className="container">
          <p className="hero-eyebrow">My family</p>
          <h1 id="fam-title">{firstName ? `Hello, ${firstName}` : 'My family'}</h1>
          <p className="family-grades-line">
            {gradeAudiences.length ? (
              <>
                Showing information for{' '}
                {gradeAudiences.map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && (i === gradeAudiences.length - 1 ? ' and ' : ', ')}
                    <strong>{g.name}</strong>
                  </span>
                ))}
                .
              </>
            ) : (
              'No grades are linked to your account yet.'
            )}{' '}
            Wrong grade? Contact the school office.
          </p>
        </div>
      </section>

      <div className="container family-body">
        {actions.length > 0 && (
          <section aria-labelledby="fam-actions">
            <h2 id="fam-actions" className="visually-hidden">
              What you can do
            </h2>
            <ul className="family-actions">
              {actions.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className={`family-action${a.primary ? ' family-action-primary' : ''}`}>
                    <span className="family-action-icon">
                      <Icon name={a.icon} size={24} />
                    </span>
                    <span className="family-action-title">{a.title}</span>
                    <span className="family-action-text">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="family-grid">
          <div className="family-main">
            {active.has('calendar') && (
              <section className="home-section" aria-labelledby="fam-events">
                <div className="section-title">
                  <h2 id="fam-events">Coming up</h2>
                </div>
                <WeekAgenda items={events} base={base} tz={tenant.timezone} today={today} days={14} alertCategories={alertCategories} />
                <p className="section-more">
                  <Link href={`${base}/calendar`}>See the full calendar</Link>
                </p>
              </section>
            )}
            {active.has('announcements') && (
              <section className="home-section" aria-labelledby="fam-updates">
                <div className="section-title">
                  <h2 id="fam-updates">Updates for your family</h2>
                </div>
                <AnnouncementList items={myUpdates.slice(0, 5)} base={base} tz={tenant.timezone} emptyText="No family updates right now." />
                <p className="section-more">
                  <Link href={`${base}/updates`}>All updates</Link>
                </p>
              </section>
            )}
          </div>

          <aside className="family-aside" aria-label="Your requests, documents and account">
            {active.has('operations_inbox') && (
              <div className="side-card">
                <h2>Your recent requests</h2>
                {requests.length === 0 ? (
                  <p className="muted">You haven&apos;t sent anything yet.</p>
                ) : (
                  <ul className="family-requests">
                    {requests.slice(0, 4).map((r) => (
                      <li key={r.id}>
                        <Link href={`${base}/requests/${r.id}`}>{r.subject}</Link>
                        <span className="family-request-meta">
                          {KIND[r.kind]} · {fmt.format(r.createdAt)}
                        </span>
                        <span className={`badge ops-status-${r.noticeStatus ?? r.status}`}>{r.noticeStatus ? NOTICE_STATUS[r.noticeStatus] : ITEM_STATUS[r.status]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`${base}/requests`}>See all requests</Link>
              </div>
            )}
            {active.has('documents') && (
              <div className="side-card">
                <h2>Documents for your family</h2>
                {myDocs.length === 0 ? (
                  <p className="muted">No documents for your grades yet.</p>
                ) : (
                  <ul className="family-docs">
                    {myDocs.slice(0, 6).map((d) => (
                      <li key={d.slug}>
                        {/* Plain link: /d/ redirects to a short-lived file URL, so it must not be prefetched. */}
                        <a href={`${base}/d/${d.slug}`} target="_blank" rel="noopener">
                          {d.title}
                          <span className="visually-hidden"> (opens in a new tab)</span>
                        </a>
                        <span className="family-request-meta">
                          {fileLabel(d.contentType)} · {formatBytes(d.sizeBytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`${base}/documents`}>All documents</Link>
              </div>
            )}
            <div className="side-card">
              <h2>Your account</h2>
              <p className="family-account-line">
                {session?.user.name}
                <br />
                <span className="muted">{session?.user.email}</span>
              </p>
              <details className="family-password">
                <summary>Change password</summary>
                <PasswordForm />
              </details>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
