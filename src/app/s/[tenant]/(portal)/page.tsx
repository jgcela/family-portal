import Link from 'next/link';
import { getDisplayView, getSession, getTenantOr404, tenantBase, getViewer } from '@/server/request';
import { BLOCK_INFO, CALENDAR_ALERT_DEFAULTS, type HomepageBlock } from '@/server/tenancy/homepage-defaults';
import { renderMarkdown } from '@/server/content/markdown';
import { listPublicOccurrences } from '@/server/services/calendar';
import { addDays, toDateStr } from '@/server/calendar/time';
import { EventList } from './calendar/event-list';
import { AnnouncementList } from './updates/announcement-list';
import { listPublicAnnouncements } from '@/server/services/content';
import { listPublicVolunteer } from '@/server/services/volunteer';
import { OpportunityCard } from './volunteer/opportunity-card';
import { linkHref, listMenuLinks } from '@/server/services/links';
import { listPublicIssues } from '@/server/services/messenger';

type Props = { params: Promise<{ tenant: string }> };

function num(v: unknown, def: number, min: number, max: number) {
  return typeof v === 'number' && Number.isInteger(v) ? Math.min(Math.max(v, min), max) : def;
}

/** "Nov 25" or "Nov 25–27" or "Dec 21–Jan 5", from local YYYY-MM-DD dates. */
function dayRange(from: string, to: string) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  if (from === to) return f(from, { month: 'short', day: 'numeric' });
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${f(from, { month: 'short', day: 'numeric' })}–${sameMonth ? f(to, { day: 'numeric' }) : f(to, { month: 'short', day: 'numeric' })}`;
}

const alertCategory = (b: HomepageBlock) =>
  (typeof b.settings.category === 'string' && b.settings.category.trim() ? b.settings.category : CALENDAR_ALERT_DEFAULTS.category).trim().toLowerCase();
const alertDays = (b: HomepageBlock) => num(b.settings.days, CALENDAR_ALERT_DEFAULTS.days, 1, 60);

export default async function FamilyHome({ params }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, session, base] = await Promise.all([getDisplayView(tenant.id), getSession(), tenantBase(key)]);
  const active = new Set(view.activeModules.map((m) => m.id));
  const blocks = view.homepage.filter((b) => {
    const info = BLOCK_INFO[b.type];
    if (!b.enabled || !info.rendered) return false;
    if (b.type === 'custom-content' && !(typeof b.settings.body === 'string' && b.settings.body.trim())) return false;
    return !info.module || active.has(info.module);
  });
  const quickLinks = blocks.some((b) => b.type === 'quick-access') ? await listMenuLinks(tenant.id, 'quick', await getViewer(tenant.id)) : [];
  // A Quick access block with nothing to show is left out rather than shown empty.
  const content = blocks.filter((b) => b.type !== 'welcome' && b.type !== 'calendar-alert' && (b.type !== 'quick-access' || quickLinks.length > 0));
  const alertBlocks = blocks.filter((b) => b.type === 'calendar-alert');
  const today = toDateStr(new Date(), tenant.timezone);
  // Calendar blocks share one query over the longest window any of them needs.
  const calBlocks = content.filter((b) => b.type === 'this-week' || b.type === 'upcoming-events');
  const horizon = Math.max(
    0,
    ...calBlocks.map((b) => (b.type === 'this-week' ? num(b.settings.days, 7, 1, 21) : num(b.settings.withinDays, 60, 7, 180))),
    ...alertBlocks.map(alertDays),
  );
  const occurrences = calBlocks.length || alertBlocks.length ? await listPublicOccurrences(tenant.id, await getViewer(tenant.id), { from: today, to: addDays(today, horizon) }) : [];
  const updates = content.some((b) => b.type === 'school-updates') ? await listPublicAnnouncements(tenant.id, await getViewer(tenant.id), { limit: 20 }) : [];
  const volBlocks = content.filter((b) => b.type === 'volunteer');
  const opportunities = volBlocks.length
    ? await listPublicVolunteer(tenant.id, await getViewer(tenant.id), { limit: Math.max(...volBlocks.map((b) => num(b.settings.limit, 3, 1, 12))) })
    : [];
  const latestIssue = content.some((b) => b.type === 'newsletter') ? ((await listPublicIssues(tenant.id, await getViewer(tenant.id), { limit: 1 }))[0] ?? null) : null;
  const renderBlock = (b: HomepageBlock) => {
    if (b.type === 'newsletter') {
      if (!latestIssue) return <p className="muted">No issues yet.</p>;
      return (
        <div>
          <p className="muted messenger-date">
            {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${latestIssue.issueDate}T12:00:00Z`))}
          </p>
          <h3 className="messenger-title">
            <Link href={`${base}/messenger/${latestIssue.id}`}>{latestIssue.title}</Link>
          </h3>
          {latestIssue.highlights.length > 0 && (
            <ul className="messenger-highlights">
              {latestIssue.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (b.type === 'quick-access') {
      return (
        <ul className="quick-links">
          {quickLinks.map((l) => (
            <li key={l.id}>
              <a href={linkHref(l, base)} {...(l.opensInNewTab ? { target: '_blank', rel: 'noopener' } : {})}>
                {l.label}
                {l.opensInNewTab && <span className="visually-hidden"> (opens in a new tab)</span>}
              </a>
            </li>
          ))}
        </ul>
      );
    }
    if (b.type === 'volunteer') {
      const list = opportunities.slice(0, num(b.settings.limit, 3, 1, 12));
      return list.length ? (
        <div className="vol-grid">
          {list.map((o) => (
            <OpportunityCard key={o.id} o={o} compact href={`${base}/volunteer#v-${o.id}`} />
          ))}
        </div>
      ) : (
        <p className="muted">No volunteer opportunities right now.</p>
      );
    }
    if (b.type === 'school-updates') {
      return (
        <AnnouncementList items={updates.slice(0, num(b.settings.limit, 4, 1, 20))} base={base} tz={tenant.timezone} emptyText="No updates right now." />
      );
    }
    if (b.type === 'this-week') {
      const days = num(b.settings.days, 7, 1, 21);
      const end = addDays(today, days - 1);
      return (
        <EventList
          items={occurrences.filter((o) => o.date <= end)}
          base={base}
          tz={tenant.timezone}
          emptyText={`Nothing on the calendar for the next ${days} days.`}
        />
      );
    }
    if (b.type === 'upcoming-events') {
      const end = addDays(today, num(b.settings.withinDays, 60, 7, 180));
      const limit = num(b.settings.limit, 5, 1, 20);
      return (
        <EventList
          items={occurrences.filter((o) => o.date <= end && o.date >= today).slice(0, limit)}
          base={base}
          tz={tenant.timezone}
          emptyText="No upcoming events."
        />
      );
    }
    if (b.type === 'custom-content' && typeof b.settings.body === 'string') {
      // renderMarkdown disables raw HTML and filters link schemes.
      return <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.settings.body).html }} />;
    }
    return null;
  };
  // Each alert shows the next event of its category starting within its window (or already under way).
  const alerts = alertBlocks
    .map((b) => {
      const until = addDays(today, alertDays(b));
      const o = occurrences.find((x) => (x.category ?? '').trim().toLowerCase() === alertCategory(b) && x.endDate >= today && x.date <= until);
      return o ? { block: b, o } : null;
    })
    .filter((x) => x !== null);
  const p = view.profile;
  const firstName = session?.user.name?.split(' ')[0];

  return (
    <div className="container">
      {alerts.map(({ block, o }) => (
        <div key={block.id} className="calendar-alert" role="status">
          <p>
            {block.title && <span className="calendar-alert-label">{block.title} </span>}
            <strong>
              {dayRange(o.date, o.endDate)}: {o.title}
            </strong>
          </p>
          <Link href={`${base}/calendar`}>See the calendar</Link>
        </div>
      ))}
      {blocks.map((b) =>
        b.type === 'welcome' ? (
          <section key={b.id} className="home-hero" aria-labelledby="welcome-title">
            <p className="home-eyebrow">{firstName ? `Welcome back, ${firstName}` : p.displayName}</p>
            <h1 id="welcome-title">{b.title ?? p.tagline ?? 'Everything your family needs, in one place.'}</h1>
          </section>
        ) : null,
      )}
      <div className={content.length ? 'home-grid' : 'home-grid home-grid-single'}>
        <div hidden={!content.length}>
          {content.map((b) => (
              <section key={b.id} className="card home-block" aria-labelledby={b.title || b.type !== 'custom-content' ? `block-${b.id}` : undefined}>
                <div className="section-title" hidden={!b.title && b.type === 'custom-content'}>
                  <h2 id={`block-${b.id}`}>{b.title || BLOCK_INFO[b.type].label}</h2>
                  {(b.type === 'this-week' || b.type === 'upcoming-events') && <Link href={`${base}/calendar`}>Full calendar</Link>}
                  {b.type === 'school-updates' && <Link href={`${base}/updates`}>All updates</Link>}
                  {b.type === 'volunteer' && <Link href={`${base}/volunteer`}>All opportunities</Link>}
                  {b.type === 'newsletter' && <Link href={`${base}/messenger`}>All issues</Link>}
                </div>
                {renderBlock(b)}
              </section>
            ))}
        </div>
        <aside aria-labelledby="office-title">
          <div className="card contact-card">
            <div className="accent-rule" aria-hidden="true" />
            <h2 id="office-title">Need the front office?</h2>
            {p.officeHours && <p>{p.officeHours}</p>}
            {p.phone && (
              <div>
                <p className="label">Call</p>
                <a href={`tel:${p.phone.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}`}>{p.phone}</a>
              </div>
            )}
            {p.email && (
              <div>
                <p className="label">Email</p>
                <a href={`mailto:${p.email}`}>{p.email}</a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
