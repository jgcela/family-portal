import Link from 'next/link';
import { headers } from 'next/headers';
import { getDisplayView, getSession, getTenantOr404, tenantBase, getViewer } from '@/server/request';
import { visibleBlocks } from '@/server/tenancy/portal-nav';
import { BLOCK_INFO, CALENDAR_ALERT_DEFAULTS, type HomepageBlock } from '@/server/tenancy/homepage-defaults';
import { renderMarkdown } from '@/server/content/markdown';
import { listCalendars, listPublicOccurrences } from '@/server/services/calendar';
import { listPublicDocuments } from '@/server/services/documents';
import { MonthAgenda, WeekAgenda } from './calendar/week-agenda';
import { DocGroups } from './documents/doc-groups';
import { toDocItems } from './documents/doc-items';
import { Icon } from './portal-icons';
import { addDays, toDateStr } from '@/server/calendar/time';
import { AnnouncementList } from './updates/announcement-list';
import { listPublicAnnouncements } from '@/server/services/content';
import { listPublicVolunteer } from '@/server/services/volunteer';
import { OpportunityCard } from './volunteer/opportunity-card';
import { linkHref, listMenuLinks } from '@/server/services/links';

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
  const blocks = visibleBlocks(view.homepage, active);
  const quickLinks =
    blocks.some((b) => b.type === 'quick-access' || (b.type === 'welcome' && b.settings.popular !== false)) && active.has('quick_links')
      ? await listMenuLinks(tenant.id, 'quick', await getViewer(tenant.id))
      : [];
  // A Quick access block with nothing to show is left out rather than shown empty.
  const welcome = blocks.find((b) => b.type === 'welcome');
  const wantPopular = !!welcome && welcome.settings.popular !== false && active.has('quick_links');
  const docBlocks = blocks.filter((b) => b.type === 'documents');
  const content = blocks.filter((b) => !['welcome', 'calendar-alert', 'documents', 'upcoming-events'].includes(b.type) && (b.type !== 'quick-access' || quickLinks.length > 0));
  const alertBlocks = blocks.filter((b) => b.type === 'calendar-alert');
  const today = toDateStr(new Date(), tenant.timezone);
  // Calendar blocks share one query over the longest window any of them needs.
  const calBlocks = blocks.filter((b) => b.type === 'this-week' || b.type === 'upcoming-events');
  const calBands = blocks.filter((b) => b.type === 'upcoming-events');
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
  const renderBlock = (b: HomepageBlock) => {
    if (b.type === 'quick-access') {
      return (
        <ul className="quick-links chip-row">
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
        <WeekAgenda
          items={occurrences.filter((o) => o.date <= end)}
          base={base}
          tz={tenant.timezone}
          today={today}
          days={days}
          alertCategories={alertBlocks.map(alertCategory)}
        />
      );
    }
    if (b.type === 'upcoming-events') {
      const end = addDays(today, num(b.settings.withinDays, 60, 7, 180));
      const limit = num(b.settings.limit, 5, 1, 20);
      return (
        <MonthAgenda
          items={occurrences.filter((o) => o.date <= end && o.endDate >= today).slice(0, limit)}
          base={base}
          tz={tenant.timezone}
          alertCategories={alertBlocks.map(alertCategory)}
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
  const docs = docBlocks.length ? toDocItems(await listPublicDocuments(tenant.id, await getViewer(tenant.id))) : [];
  const subscribeCal = active.has('calendar') ? (await listCalendars(tenant.id)).find((c) => c.isPublic) : undefined;
  const host = (await headers()).get('host') ?? '';
  const tel = p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}` : null;
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${today}T12:00:00Z`));

  return (
    <>
      {alerts.map(({ block, o }) => (
        <div key={block.id} className="alert-band" role="status">
          <div className="container alert-band-inner">
            <p>
              <Icon name="calendar" />
              {block.title && <span className="calendar-alert-label">{block.title} </span>}
              <strong>
                {dayRange(o.date, o.endDate)}: {o.title}
              </strong>
            </p>
            <Link href={`${base}/calendar`}>See the calendar</Link>
          </div>
        </div>
      ))}
      {welcome && (
        <section className="hero-band" aria-labelledby="welcome-title">
          <div className="container hero-inner">
            <p className="hero-eyebrow">
              {typeof welcome.settings.eyebrow === 'string' && welcome.settings.eyebrow ? welcome.settings.eyebrow : firstName ? `Welcome back, ${firstName}` : p.displayName}
            </p>
            <h1 id="welcome-title">{welcome.title ?? p.tagline ?? 'Everything your family needs, in one place.'}</h1>
            {typeof welcome.settings.intro === 'string' && welcome.settings.intro && <p className="hero-intro">{welcome.settings.intro}</p>}
            {welcome.settings.search !== false && active.has('documents') && (
              <form className="hero-search" action={`${base}/documents`} method="get" role="search">
                <label htmlFor="hero-q">Search forms and documents</label>
                <div className="hero-search-box">
                  <Icon name="search" />
                  <input id="hero-q" name="q" type="search" placeholder="Try “medical form” or “handbook”" autoComplete="off" maxLength={100} />
                  <button type="submit" className="visually-hidden">
                    Search
                  </button>
                </div>
              </form>
            )}
            {wantPopular && quickLinks.length > 0 && (
              <div className="hero-popular">
                <span>Popular:</span>
                <ul className="chip-row">
                  {quickLinks.map((l) => (
                    <li key={l.id}>
                      <a href={linkHref(l, base)} {...(l.opensInNewTab ? { target: '_blank', rel: 'noopener' } : {})}>
                        {l.label}
                        {l.opensInNewTab && <span className="visually-hidden"> (opens in a new tab)</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
      <div className={`container home-grid${content.length ? '' : ' home-grid-single'}`}>
        <div hidden={!content.length} className="home-col">
          {content.map((b) => (
            <section key={b.id} className="home-section" id={b.type === 'this-week' ? 'this-week' : undefined} aria-labelledby={b.title || b.type !== 'custom-content' ? `block-${b.id}` : undefined}>
              {b.type === 'this-week' && <p className="section-eyebrow">Today is {todayLabel}</p>}
              <div className="section-title" hidden={!b.title && b.type === 'custom-content'}>
                <h2 id={`block-${b.id}`}>{b.title || BLOCK_INFO[b.type].label}</h2>
              </div>
              {renderBlock(b)}
              {b.type === 'this-week' && (
                <p className="section-more">
                  <a href={calBands.length ? '#calendar' : `${base}/calendar`}>See the full calendar</a>
                </p>
              )}
              {b.type === 'school-updates' && (
                <p className="section-more">
                  <Link href={`${base}/updates`}>All updates</Link>
                </p>
              )}
              {b.type === 'volunteer' && (
                <p className="section-more">
                  <Link href={`${base}/volunteer`}>All opportunities</Link>
                </p>
              )}
            </section>
          ))}
        </div>
        <aside className="home-aside" aria-label="Calendar and contact">
          {subscribeCal && (
            <div className="side-card side-card-tint">
              <Icon name="phone" />
              <h2>Get the calendar on your phone</h2>
              <p>Subscribe once. New events and changes show up in your own calendar automatically.</p>
              <a className="btn btn-primary btn-block" href={`${base}/calendar/feed/${subscribeCal.key}.ics?google=1`}>
                Add to Google Calendar
              </a>
              <a className="btn btn-block btn-outline" href={`webcal://${host}${base}/calendar/feed/${subscribeCal.key}.ics`}>
                Apple or Outlook (iCal)
              </a>
            </div>
          )}
          {(p.phone || p.email || p.officeHours) && (
            <div className="side-card">
              <h2>Need the front office?</h2>
              <ul className="contact-list">
                {p.phone && (
                  <li>
                    <Icon name="call" />
                    <a href={tel!}>{p.phone}</a>
                  </li>
                )}
                {p.email && (
                  <li>
                    <Icon name="mail" />
                    <a href={`mailto:${p.email}`}>{p.email}</a>
                  </li>
                )}
                {p.officeHours && (
                  <li>
                    <Icon name="clock" />
                    <span>{p.officeHours}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </aside>
      </div>
      {docBlocks.map((b) => (
        <section key={b.id} className="tint-band" id="documents" aria-labelledby={`block-${b.id}`}>
          <div className="container">
            <div className="section-title">
              <h2 id={`block-${b.id}`}>{b.title || BLOCK_INFO.documents.label}</h2>
            </div>
            {typeof b.settings.intro === 'string' && b.settings.intro && <p className="section-intro">{b.settings.intro}</p>}
            <DocGroups items={docs} base={base} />
          </div>
        </section>
      ))}
      {calBands.map((b, i) => (
        <section key={b.id} className="cal-band" id={i === 0 ? 'calendar' : undefined} aria-labelledby={`block-${b.id}`}>
          <div className="container">
            <div className="cal-band-head">
              <div className="section-title">
                <h2 id={`block-${b.id}`}>{b.title || BLOCK_INFO['upcoming-events'].label}</h2>
              </div>
              <div className="cal-band-tools">
                {subscribeCal && (
                  <a className="btn btn-outline" href={`webcal://${host}${base}/calendar/feed/${subscribeCal.key}.ics`}>
                    Subscribe
                  </a>
                )}
                <Link className="btn btn-primary" href={`${base}/calendar`}>
                  Open the full calendar
                </Link>
              </div>
            </div>
            {renderBlock(b)}
          </div>
        </section>
      ))}
    </>
  );
}
