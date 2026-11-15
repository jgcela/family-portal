import Link from 'next/link';
import type { PublicOccurrence } from '@/server/services/calendar';
import { addDays } from '@/server/calendar/time';
import { formatDate, formatTime } from '@/lib/when';
import { categoryLabel, occurrenceHref } from './event-list';

const md = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const weekStart = (d: string) => addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay());

function weekLabel(start: string, thisWeek: string) {
  const end = addDays(start, 6);
  const range = `${md(start, { month: 'short', day: 'numeric' })}–${start.slice(5, 7) === end.slice(5, 7) ? md(end, { day: 'numeric' }) : md(end, { month: 'short', day: 'numeric' })}`;
  if (start === thisWeek) return `This week · ${range}`;
  if (start === addDays(thisWeek, 7)) return `Next week · ${range}`;
  return `Week of ${range}`;
}

/** Same category name, same colour, for every school: four theme-derived styles picked by the name. */
export function pillClass(category: string, alertCategories: string[]) {
  const c = category.trim().toLowerCase();
  if (alertCategories.includes(c)) return 'pill pill-alert';
  let h = 0;
  for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `pill pill-${['a', 'b', 'c'][h % 3]}`;
}

function when(o: PublicOccurrence, tz: string) {
  const day = md(o.date, { weekday: 'long' });
  if (o.allDay) return o.endDate !== o.date ? `${day} · until ${formatDate(o.endDate, { year: false, weekday: false })}` : `${day} · All day`;
  return `${day} · ${formatTime(o.start!, tz)}`;
}

/** One event: date tile, title, when and where, category pills. */
function AgendaRow({ o, base, tz, alertCategories }: { o: PublicOccurrence; base: string; tz: string; alertCategories: string[] }) {
  return (
    <li className={o.isImportant ? 'is-important' : undefined}>
      <span className="date-tile" aria-hidden="true">
        <span className="date-tile-month">{md(o.date, { month: 'short' })}</span>
        <span className="date-tile-day">{md(o.date, { day: 'numeric' })}</span>
      </span>
      <div className="week-row-main">
        <Link href={occurrenceHref(base, o)} className="week-row-title">
          {o.title}
        </Link>
        <p className="week-row-meta">
          <span className="visually-hidden">{formatDate(o.date)}, </span>
          {when(o, tz)}
          {o.location && ` · ${o.location}`}
        </p>
      </div>
      <span className="week-row-tags">
        {o.category && <span className={pillClass(o.category, alertCategories)}>{categoryLabel(o.category)}</span>}
        {o.isImportant && <span className="pill pill-outline">Important</span>}
      </span>
    </li>
  );
}

/** Upcoming events grouped by month ("November 2026"), same rows as the weekly view. */
export function MonthAgenda({ items, base, tz, alertCategories }: { items: PublicOccurrence[]; base: string; tz: string; alertCategories: string[] }) {
  if (!items.length) return <p className="week-empty">No upcoming events.</p>;
  const months = new Map<string, PublicOccurrence[]>();
  for (const o of items) months.set(o.date.slice(0, 7), [...(months.get(o.date.slice(0, 7)) ?? []), o]);
  return (
    <div className="week-agenda by-month-agenda">
      {[...months.entries()].map(([m, list]) => {
        const label = md(`${m}-01`, { month: 'long', year: 'numeric' });
        return (
          <section key={m} aria-label={label}>
            <h3 className="week-label">{label}</h3>
            <ul className="week-rows">
              {list.map((o) => (
                <AgendaRow key={`${o.eventId}-${o.date}`} o={o} base={base} tz={tz} alertCategories={alertCategories} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Events from today to `days` ahead, grouped by week (Sunday to Saturday) with a
 * date tile per event. Weeks with nothing still show, so families see it is quiet.
 */
export function WeekAgenda({
  items,
  base,
  tz,
  today,
  days,
  alertCategories,
}: {
  items: PublicOccurrence[];
  base: string;
  tz: string;
  today: string;
  days: number;
  alertCategories: string[];
}) {
  const first = weekStart(today);
  const last = weekStart(addDays(today, days - 1));
  const weeks: string[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w);
  return (
    <div className="week-agenda">
      {weeks.map((w) => {
        const list = items.filter((o) => o.date >= w && o.date <= addDays(w, 6));
        return (
          <section key={w} aria-label={weekLabel(w, first)}>
            <h3 className="week-label">{weekLabel(w, first)}</h3>
            {list.length === 0 ? (
              <p className="week-empty">{w === first ? 'Nothing else on the calendar this week.' : 'Nothing on the calendar this week.'}</p>
            ) : (
              <ul className="week-rows">
                {list.map((o) => (
                  <AgendaRow key={`${o.eventId}-${o.date}`} o={o} base={base} tz={tz} alertCategories={alertCategories} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
