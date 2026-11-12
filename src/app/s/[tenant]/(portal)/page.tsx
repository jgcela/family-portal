import Link from 'next/link';
import { getPortalView, getSession, getTenantOr404, tenantBase } from '@/server/request';
import type { HomepageBlock } from '@/server/tenancy/homepage-defaults';
import { listPublicOccurrences } from '@/server/services/calendar';
import { addDays, toDateStr } from '@/server/calendar/time';
import { EventList } from './calendar/event-list';

// Which module supplies each homepage block. Blocks whose module is not active
// for the school are skipped, so families never see empty placeholders.
const BLOCK_SOURCE: Partial<Record<HomepageBlock['type'], string>> = {
  'action-required': 'action_required',
  'this-week': 'calendar',
  'upcoming-events': 'calendar',
  'school-updates': 'announcements',
  newsletter: 'messenger',
  'featured-resources': 'resources',
  'quick-access': 'quick_links',
  volunteer: 'volunteer',
  'your-children': 'student_profiles',
};

// Blocks that have a working renderer. Others stay hidden until their module ships.
const RENDERED = new Set<HomepageBlock['type']>(['welcome', 'this-week', 'upcoming-events']);

type Props = { params: Promise<{ tenant: string }> };

function num(v: unknown, def: number, min: number, max: number) {
  return typeof v === 'number' && Number.isInteger(v) ? Math.min(Math.max(v, min), max) : def;
}

export default async function FamilyHome({ params }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, session, base] = await Promise.all([getPortalView(tenant.id), getSession(), tenantBase(key)]);
  const active = new Set(view.activeModules.map((m) => m.id));
  const blocks = view.homepage.filter((b) => {
    if (!b.enabled || !RENDERED.has(b.type)) return false;
    const source = BLOCK_SOURCE[b.type];
    return !source || active.has(source);
  });
  const content = blocks.filter((b) => b.type !== 'welcome');
  const today = toDateStr(new Date(), tenant.timezone);
  // Calendar blocks share one query over the longest window any of them needs.
  const calBlocks = content.filter((b) => b.type === 'this-week' || b.type === 'upcoming-events');
  const horizon = Math.max(
    0,
    ...calBlocks.map((b) => (b.type === 'this-week' ? num(b.settings.days, 7, 1, 21) : num(b.settings.withinDays, 60, 7, 180))),
  );
  const occurrences = calBlocks.length ? await listPublicOccurrences(tenant.id, { from: today, to: addDays(today, horizon) }) : [];
  const renderBlock = (b: HomepageBlock) => {
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
    return null;
  };
  const p = view.profile;
  const firstName = session?.user.name?.split(' ')[0];

  return (
    <div className="container">
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
              <section key={b.id} className="card home-block" aria-labelledby={`block-${b.id}`}>
                <div className="section-title">
                  <h2 id={`block-${b.id}`}>{b.title}</h2>
                  {(b.type === 'this-week' || b.type === 'upcoming-events') && <Link href={`${base}/calendar`}>Full calendar</Link>}
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
