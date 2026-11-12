import Link from 'next/link';
import type { PublicOccurrence } from '@/server/services/calendar';
import { formatDate, formatTime } from '@/lib/when';

export function categoryLabel(c: string | null) {
  if (!c) return null;
  const known: Record<string, string> = { noclasses: 'No classes', faith: 'Faith', academic: 'Academic', community: 'Community', health: 'Health' };
  return known[c] ?? c.replace(/[-_]+/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
}

export function occurrenceHref(base: string, o: PublicOccurrence) {
  return `${base}/calendar/event/${o.eventId}${o.isRecurring ? `?date=${o.date}` : ''}`;
}

function timeLabel(o: PublicOccurrence, tz: string) {
  if (o.allDay) return o.endDate !== o.date ? `Until ${formatDate(o.endDate, { year: false })}` : 'All day';
  const s = formatTime(o.start!, tz);
  return o.end && o.end.getTime() !== o.start!.getTime() ? `${s} – ${formatTime(o.end, tz)}` : s;
}

/** Events grouped by day: used by the list view, This Week, and the phone month view. */
export function EventList({ items, base, tz, emptyText }: { items: PublicOccurrence[]; base: string; tz: string; emptyText: string }) {
  if (!items.length) return <p className="empty">{emptyText}</p>;
  const days = new Map<string, PublicOccurrence[]>();
  for (const o of items) days.set(o.date, [...(days.get(o.date) ?? []), o]);
  return (
    <div className="agenda">
      {[...days].map(([date, list]) => (
        <section key={date} className="agenda-day" aria-label={formatDate(date)}>
          <h3 className="agenda-date">{formatDate(date, { year: false })}</h3>
          <ul>
            {list.map((o) => (
              <li key={`${o.eventId}-${o.date}`} className={`agenda-item${o.isImportant ? ' is-important' : ''}`}>
                <span className="agenda-bar" style={{ background: o.calendar.color }} aria-hidden="true" />
                <div>
                  <Link href={occurrenceHref(base, o)} className="agenda-title">
                    {o.title}
                  </Link>
                  <p className="agenda-meta">
                    {timeLabel(o, tz)}
                    {o.location && ` · ${o.location}`}
                    {o.category && <span className="cat-tag">{categoryLabel(o.category)}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
