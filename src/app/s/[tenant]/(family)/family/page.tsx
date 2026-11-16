// "My family": the signed-in family's home. What needs them, their children,
// what is coming up and what the school published for their grades. Only portal
// content, the family's own requests and the children the school links to them
// (FACTS or the manual list); no student records (grades, attendance history).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalView, getSession, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { listAudiences, listPublicOccurrences } from '@/server/services/calendar';
import { listPublicAnnouncements } from '@/server/services/content';
import { listPublicDocuments } from '@/server/services/documents';
import { myRequests } from '@/server/services/inbox';
import { familyChildren } from '@/server/services/directory';
import { assistantAvailableFor } from '@/server/services/assistant';
import { familyAssistantAvailable } from '@/server/services/family-assistant';
import { CALENDAR_ALERT_DEFAULTS } from '@/server/tenancy/homepage-defaults';
import { addDays, toDateStr } from '@/server/calendar/time';
import { formatTime } from '@/lib/when';
import { excerpt } from '@/server/content/markdown';
import { categoryLabel, occurrenceHref } from '@/app/s/[tenant]/(portal)/calendar/event-list';
import { pillClass } from '@/app/s/[tenant]/(portal)/calendar/week-agenda';
import { formatPosted } from '@/app/s/[tenant]/(portal)/updates/announcement-list';
import { fileLabel, formatBytes } from '@/app/s/[tenant]/admin/documents/shared';
import { ITEM_STATUS, KIND, NOTICE_STATUS } from '../requests/labels';
import { Icon } from '@/app/s/[tenant]/(portal)/portal-icons';

export const metadata = { title: 'My family' };
export const dynamic = 'force-dynamic';

type IconName = Parameters<typeof Icon>[0]['name'];
type Action = { href: string; icon: IconName; title: string };

const md = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

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

  const [events, updates, docs, requests, children, canAsk, hasAssistant] = await Promise.all([
    active.has('calendar') ? listPublicOccurrences(tenant.id, viewer, { from: today, to: addDays(today, 13) }, { audienceIds: [...viewer.audienceIds] }) : [],
    active.has('announcements') ? listPublicAnnouncements(tenant.id, viewer, { audienceIds: [...viewer.audienceIds], limit: 30 }) : [],
    active.has('documents') ? listPublicDocuments(tenant.id, viewer) : [],
    active.has('operations_inbox') ? myRequests(tenant.id, viewer) : [],
    // Optional: if the student system is unreachable the page still works without the children cards.
    familyChildren(tenant.id, viewer).catch(() => []),
    assistantAvailableFor(tenant.id, viewer, [...active]),
    familyAssistantAvailable(tenant.id, viewer),
  ]);
  const myUpdates = updates.filter((u) => forMe(u.audienceIds) || u.visibility === 'families');
  // School updates: the ones aimed at this family first, then the latest for everyone.
  const shownUpdates = [...myUpdates, ...updates.filter((u) => !myUpdates.includes(u))].slice(0, 4);
  const myDocs = docs.filter((d) => forMe(d.audienceIds) || d.visibility === 'families');
  const alertCategories = view.homepage
    .filter((b) => b.type === 'calendar-alert' && b.enabled)
    .map((b) => (typeof b.settings.category === 'string' && b.settings.category.trim() ? b.settings.category : CALENDAR_ALERT_DEFAULTS.category).trim().toLowerCase());
  const firstName = session?.user.name.split(' ')[0];
  const openRequests = requests.filter((r) => ['new', 'in_progress', 'waiting'].includes(r.status));
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: tenant.timezone });
  const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tenant.timezone }).format(new Date());
  const askHref = hasAssistant ? `${base}/assistant` : canAsk ? `${base}/ask` : null;

  // "Needs your attention": the school is waiting for a reply, plus urgent notices and
  // "no school"-type days in the next two weeks.
  type Attention = { key: string; icon: IconName; title: string; meta: string; href: string; cta: string };
  const attention: Attention[] = [
    ...requests
      .filter((r) => r.status === 'waiting')
      .map((r) => ({ key: r.id, icon: 'inbox' as const, title: r.subject, meta: `${r.student ? `${r.student} · ` : ''}The office is waiting for your reply`, href: `${base}/requests/${r.id}`, cta: 'Reply' })),
    ...myUpdates
      .filter((u) => u.isUrgent)
      .slice(0, 2)
      .map((u) => ({ key: u.id, icon: 'mail' as const, title: u.title, meta: `Urgent · ${formatPosted(u.publishAt ?? u.publishedAt, tenant.timezone)}`, href: `${base}/updates/${u.id}`, cta: 'Read' })),
    ...events
      .filter((e) => e.category && alertCategories.includes(e.category.trim().toLowerCase()))
      .slice(0, 2)
      .map((e) => ({ key: `${e.eventId}-${e.date}`, icon: 'calendar' as const, title: e.title, meta: md(e.date, { weekday: 'long', month: 'short', day: 'numeric' }), href: occurrenceHref(base, e), cta: 'Details' })),
  ];

  const actions: Action[] = [
    ...(active.has('attendance_notices') ? [{ href: `${base}/absence`, icon: 'absence' as const, title: 'Report an absence' }] : []),
    ...(active.has('operations_inbox')
      ? [
          { href: `${base}/requests?new=1`, icon: 'mail' as const, title: 'Contact the office' },
          { href: `${base}/requests`, icon: 'inbox' as const, title: openRequests.length ? `My requests (${openRequests.length} open)` : 'My requests' },
        ]
      : []),
    ...(active.has('documents') ? [{ href: `${base}/documents`, icon: 'doc' as const, title: 'School documents' }] : []),
    ...(active.has('volunteer') ? [{ href: `${base}/volunteer`, icon: 'heart' as const, title: 'Volunteer' }] : []),
  ];

  return (
    <div className="ws-page fam">
      <p className="ws-eyebrow">{longDate}</p>
      <h1 className="ws-h1">{firstName ? `${greeting(tenant.timezone)}, ${firstName}.` : 'My family'}</h1>
      <p className="ws-sub">
        Here&rsquo;s what matters for your family today
        {gradeAudiences.length > 0 && (
          <>
            {' '}
            in{' '}
            {gradeAudiences.map((g, i) => (
              <span key={g.id}>
                {i > 0 && (i === gradeAudiences.length - 1 ? ' and ' : ', ')}
                {g.name}
              </span>
            ))}
          </>
        )}
        .
      </p>

      {askHref && (
        <Link href={askHref} className="fam-ask">
          <span className="fam-ask-icon">
            <Icon name="spark" size={26} />
          </span>
          <span className="fam-ask-text">
            <strong>Ask {view.profile.shortName ?? 'the school'}</strong>
            <small>
              {hasAssistant ? 'Find answers, check a request or report an absence' : 'Find answers in the handbook and school documents'}
            </small>
          </span>
          <Icon name="arrow" size={22} />
        </Link>
      )}

      <div className="fam-cols">
        <div className="fam-main">
          <section className="fam-section" aria-labelledby="fam-attn">
            <div className="fam-heading">
              <h2 id="fam-attn">Needs your attention</h2>
              {attention.length > 0 && <span className="fam-count">{attention.length} pending</span>}
            </div>
            {attention.length === 0 ? (
              <p className="fam-empty">
                <Icon name="heart" size={18} /> You&rsquo;re all caught up. Nothing needs you right now.
              </p>
            ) : (
              <ul className="fam-list">
                {attention.map((a) => (
                  <li key={a.key} className="fam-card fam-card-row">
                    <span className="fam-card-icon">
                      <Icon name={a.icon} size={20} />
                    </span>
                    <span className="fam-card-text">
                      <strong>{a.title}</strong>
                      <small>{a.meta}</small>
                    </span>
                    <Link href={a.href} className="fam-btn">
                      {a.cta}
                      <span className="visually-hidden">: {a.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {children.length > 0 && (
            <section className="fam-section" aria-labelledby="fam-kids">
              <div className="fam-heading">
                <h2 id="fam-kids">Your children</h2>
              </div>
              <ul className="fam-kids">
                {children.map((c) => {
                  const open = openRequests.filter((r) => r.student && r.student === c.name).length;
                  return (
                    <li key={c.key} className="fam-kid">
                      <span className="fam-avatar" aria-hidden="true">
                        {c.name.slice(0, 1).toUpperCase()}
                      </span>
                      <strong>{c.name}</strong>
                      <small>
                        {c.grade ?? 'Grade not set'}
                        {open > 0 && ` · ${open} open request${open > 1 ? 's' : ''}`}
                      </small>
                      {c.canSubmitAttendance && active.has('attendance_notices') && (
                        <Link href={`${base}/absence`} className="fam-kid-link">
                          Report an absence<span className="visually-hidden"> for {c.name}</span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {active.has('announcements') && (
            <section className="fam-section" aria-labelledby="fam-updates">
              <div className="fam-heading">
                <h2 id="fam-updates">School updates</h2>
                <Link href={`${base}/updates`}>All updates →</Link>
              </div>
              {shownUpdates.length === 0 ? (
                <p className="fam-empty">No school updates right now.</p>
              ) : (
                <ul className="fam-list">
                  {shownUpdates.map((u) => (
                    <li key={u.id} className="fam-card">
                      <Link href={`${base}/updates/${u.id}`} className="fam-card-title">
                        {u.title}
                      </Link>
                      <small>
                        {formatPosted(u.publishAt ?? u.publishedAt, tenant.timezone)} · {u.summary || excerpt(u.body, 110)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {active.has('documents') && myDocs.length > 0 && (
            <section className="fam-section" aria-labelledby="fam-docs">
              <div className="fam-heading">
                <h2 id="fam-docs">Documents for your family</h2>
                <Link href={`${base}/documents`}>All documents →</Link>
              </div>
              <ul className="fam-list">
                {myDocs.slice(0, 4).map((d) => (
                  <li key={d.slug} className="fam-card fam-card-row">
                    <span className="fam-card-icon">
                      <Icon name="doc" size={20} />
                    </span>
                    <span className="fam-card-text">
                      {/* Plain link: /d/ redirects to a short-lived file URL, so it must not be prefetched. */}
                      <a href={`${base}/d/${d.slug}`} target="_blank" rel="noopener" className="fam-card-title">
                        {d.title}
                        <span className="visually-hidden"> (opens in a new tab)</span>
                      </a>
                      <small>
                        {fileLabel(d.contentType)} · {formatBytes(d.sizeBytes)}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="fam-aside" aria-label="Coming up and quick actions">
          {active.has('calendar') && (
            <section aria-labelledby="fam-next">
              <div className="fam-heading">
                <h2 id="fam-next">Coming up</h2>
                <Link href={`${base}/calendar`}>Calendar →</Link>
              </div>
              {events.length === 0 ? (
                <p className="fam-empty">Nothing on the calendar for the next two weeks.</p>
              ) : (
                <ul className="fam-events">
                  {events.slice(0, 6).map((e) => (
                    <li key={`${e.eventId}-${e.date}-${e.start ?? ''}`}>
                      <span className="fam-date" aria-hidden="true">
                        <small>{md(e.date, { month: 'short' })}</small>
                        <strong>{md(e.date, { day: 'numeric' })}</strong>
                      </span>
                      <span className="fam-event-text">
                        <Link href={occurrenceHref(base, e)}>{e.title}</Link>
                        <small>
                          {md(e.date, { weekday: 'short' })}
                          {e.allDay ? ' · All day' : e.start ? ` · ${formatTime(e.start, tenant.timezone)}` : ''}
                          {e.category && (
                            <>
                              {' '}
                              <span className={pillClass(e.category, alertCategories)}>{categoryLabel(e.category)}</span>
                            </>
                          )}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {actions.length > 0 && (
            <section className="fam-quick" aria-labelledby="fam-quick">
              <h2 id="fam-quick">Quick actions</h2>
              <ul>
                {actions.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href}>
                      <Icon name={a.icon} size={18} />
                      <span>{a.title}</span>
                      <Icon name="arrow" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active.has('operations_inbox') && requests.length > 0 && (
            <section aria-labelledby="fam-reqs">
              <div className="fam-heading">
                <h2 id="fam-reqs">Recent requests</h2>
                <Link href={`${base}/requests`}>All →</Link>
              </div>
              <ul className="fam-reqs">
                {requests.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}/requests/${r.id}`}>{r.subject}</Link>
                    <small>
                      {KIND[r.kind]} · {fmt.format(r.createdAt)}
                    </small>
                    <span className={`badge ops-status-${r.noticeStatus ?? r.status}`}>{r.noticeStatus ? NOTICE_STATUS[r.noticeStatus] : ITEM_STATUS[r.status]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </aside>
      </div>
    </div>
  );
}
