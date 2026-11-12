import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getPortalView, getTenantOr404, tenantBase } from '@/server/request';
import { listAudiences, listCalendars, listPublicOccurrences, type PublicOccurrence } from '@/server/services/calendar';
import { addDays, toDateStr } from '@/server/calendar/time';
import { formatDate, formatTime } from '@/lib/when';
import { categoryLabel, EventList, occurrenceHref } from './event-list';

export const metadata = { title: 'Calendar' };

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ view?: string; month?: string; cal?: string; aud?: string }>;
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function CalendarPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'calendar')) notFound();
  const base = await tenantBase(key);
  const host = (await headers()).get('host') ?? '';
  const sp = await searchParams;
  const tz = tenant.timezone;
  const today = toDateStr(new Date(), tz);
  const mode = sp.view === 'list' ? 'list' : 'month';
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : today.slice(0, 7);
  const [cals, auds] = await Promise.all([listCalendars(tenant.id), listAudiences(tenant.id)]);
  const publicCals = cals.filter((c) => c.isPublic);
  const calKey = publicCals.some((c) => c.key === sp.cal) ? sp.cal : undefined;
  const audId = auds.some((a) => a.id === sp.aud) ? sp.aud : undefined;

  // Month grid covers whole weeks; list view shows the next 8 weeks.
  const first = `${month}-01`;
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay();
  const gridStart = addDays(first, -lead);
  const nextMonth = addDays(first, 32).slice(0, 7);
  const prevMonth = addDays(first, -1).slice(0, 7);
  const monthEnd = addDays(`${nextMonth}-01`, -1);
  const trail = 6 - new Date(`${monthEnd}T12:00:00Z`).getUTCDay();
  const gridEnd = addDays(monthEnd, trail);
  const range = mode === 'month' ? { from: gridStart, to: gridEnd } : { from: today, to: addDays(today, 55) };

  const items = await listPublicOccurrences(tenant.id, range, {
    calendarKeys: calKey ? [calKey] : undefined,
    audienceIds: audId ? [audId] : undefined,
  });

  const q = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: mode === 'list' ? 'list' : undefined, month: mode === 'month' ? month : undefined, cal: calKey, aud: audId, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `${base}/calendar${s ? `?${s}` : ''}`;
  };

  // Day → occurrences covering it (multi-day events appear on each day).
  const byDay = new Map<string, PublicOccurrence[]>();
  if (mode === 'month') {
    for (const o of items) {
      for (let d = o.date < gridStart ? gridStart : o.date; d <= o.endDate && d <= gridEnd; d = addDays(d, 1)) {
        byDay.set(d, [...(byDay.get(d) ?? []), o]);
      }
    }
  }
  const weeks: string[][] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${first}T12:00:00Z`));
  const monthItems = items.filter((o) => o.endDate >= first && o.date <= monthEnd);
  const usedCats = [...new Set(items.map((o) => o.category).filter(Boolean))] as string[];

  return (
    <div className="container cal-page">
      <div className="cal-head">
        <div>
          <h1>Calendar</h1>
          <p className="cal-sub">Times are shown in {tz.split('/').pop()!.replace('_', ' ')} time.</p>
        </div>
        <div className="cal-actions">
          <div className="segmented" role="group" aria-label="View">
            <Link href={q({ view: undefined, month })} aria-current={mode === 'month' ? 'true' : undefined}>
              Month
            </Link>
            <Link href={q({ view: 'list', month: undefined })} aria-current={mode === 'list' ? 'true' : undefined}>
              List
            </Link>
          </div>
          {publicCals.length > 0 && (
            <details className="subscribe">
              <summary className="btn btn-quiet">Subscribe</summary>
              <div className="subscribe-panel">
                <p>Add the school calendar to your phone or computer. It stays up to date automatically.</p>
                <ul>
                  {publicCals.map((c) => (
                    <li key={c.id}>
                      <strong>{c.name}</strong>
                      <span>
                        <a href={`webcal://${host}${base}/calendar/feed/${c.key}.ics`}>Apple / Outlook</a>
                        {' · '}
                        <a href={`${base}/calendar/feed/${c.key}.ics`}>Download .ics</a>
                        {' · '}
                        <a href={`${base}/calendar/feed/${c.key}.ics?google=1`}>Google Calendar</a>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
        </div>
      </div>

      <form className="cal-filters" method="get" action={`${base}/calendar`}>
        {mode === 'list' && <input type="hidden" name="view" value="list" />}
        {mode === 'month' && <input type="hidden" name="month" value={month} />}
        {publicCals.length > 1 && (
          <div className="field">
            <label htmlFor="cal">Calendar</label>
            <select id="cal" name="cal" defaultValue={calKey ?? ''}>
              <option value="">All calendars</option>
              {publicCals.map((c) => (
                <option key={c.id} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="aud">Show events for</label>
          <select id="aud" name="aud" defaultValue={audId ?? ''}>
            <option value="">Everyone</option>
            {auds
              .filter((a) => a.kind === 'grade' || a.kind === 'level')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
        <button type="submit" className="btn btn-quiet">
          Apply
        </button>
      </form>

      {mode === 'month' ? (
        <>
          <div className="month-nav">
            <Link href={q({ month: prevMonth })} className="btn btn-quiet" aria-label={`Previous month`}>
              ‹
            </Link>
            <h2 aria-live="polite">{monthTitle}</h2>
            <Link href={q({ month: nextMonth })} className="btn btn-quiet" aria-label={`Next month`}>
              ›
            </Link>
            {month !== today.slice(0, 7) && (
              <Link href={q({ month: today.slice(0, 7) })} className="today-link">
                Today
              </Link>
            )}
          </div>
          <table className="month-grid">
            <caption className="visually-hidden">{monthTitle}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map((d) => (
                  <th key={d} scope="col">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w[0]}>
                  {w.map((d) => {
                    const list = byDay.get(d) ?? [];
                    const out = d.slice(0, 7) !== month;
                    return (
                      <td key={d} className={`${out ? 'is-out' : ''}${d === today ? ' is-today' : ''}`}>
                        <span className="day-num" aria-label={formatDate(d)}>
                          {Number(d.slice(8))}
                        </span>
                        <ul>
                          {list.slice(0, 4).map((o) => (
                            <li key={`${o.eventId}-${o.date}`}>
                              <Link
                                href={occurrenceHref(base, o)}
                                className={`chip${o.allDay ? ' chip-allday' : ''}`}
                                style={{ ['--chip' as string]: o.calendar.color }}
                              >
                                {!o.allDay && o.date === d && <span className="chip-time">{formatTime(o.start!, tz).replace(/ (AM|PM)$/, (x) => x.trim()[0]!.toLowerCase())}</span>}
                                {o.title}
                              </Link>
                            </li>
                          ))}
                          {list.length > 4 && <li className="more">+{list.length - 4} more</li>}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="month-agenda">
            <h2 className="visually-hidden">Events in {monthTitle}</h2>
            <EventList items={monthItems} base={base} tz={tz} emptyText="No events this month." />
          </div>
        </>
      ) : (
        <EventList items={items} base={base} tz={tz} emptyText="No upcoming events in the next eight weeks." />
      )}

      {usedCats.length > 0 && (
        <p className="cal-legend">
          Categories:{' '}
          {usedCats.map((c) => (
            <span key={c} className="cat-tag">
              {categoryLabel(c)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
