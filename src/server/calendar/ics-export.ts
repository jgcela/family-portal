// iCalendar (RFC 5545) output for subscription feeds and "Add to Calendar".
import { addDays } from './time';

export type ExportEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  rrule: string | null;
  exdates: string[];
  updatedAt: Date;
};

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds lines at 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (curLen + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const d8 = (s: string) => s.replace(/-/g, '');
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function localStamp(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

export function buildIcs(opts: { name: string; domain: string; events: ExportEvent[] }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family Portal//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.name)}`,
  ];
  for (const e of opts.events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@${opts.domain}`, `DTSTAMP:${utc(e.updatedAt)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${d8(e.startDate!)}`);
      // DTEND is exclusive for all-day events.
      lines.push(`DTEND;VALUE=DATE:${d8(addDays(e.endDate ?? e.startDate!, 1))}`);
    } else {
      lines.push(`DTSTART;TZID=${e.timezone}:${localStamp(e.startsAt!, e.timezone)}`);
      lines.push(`DTEND;TZID=${e.timezone}:${localStamp(e.endsAt ?? e.startsAt!, e.timezone)}`);
    }
    if (e.rrule) lines.push(`RRULE:${e.rrule.replace(/^RRULE:/i, '')}`);
    for (const x of e.exdates) {
      if (e.allDay) lines.push(`EXDATE;VALUE=DATE:${d8(x)}`);
      else lines.push(`EXDATE;TZID=${e.timezone}:${d8(x)}T${localStamp(e.startsAt!, e.timezone).slice(9)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Google Calendar "add event" link for one occurrence. */
export function googleCalendarLink(o: {
  title: string;
  details?: string | null;
  location?: string | null;
  allDay: boolean;
  date: string;
  endDate: string;
  start: Date | null;
  end: Date | null;
}): string {
  const dates = o.allDay
    ? `${d8(o.date)}/${d8(addDays(o.endDate, 1))}`
    : `${utc(o.start!)}/${utc(o.end ?? o.start!)}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: o.title, dates });
  if (o.details) q.set('details', o.details.slice(0, 1500));
  if (o.location) q.set('location', o.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
