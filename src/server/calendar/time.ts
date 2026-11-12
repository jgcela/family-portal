// Timezone and recurrence helpers. No external timezone database: Intl (ICU)
// ships with Node and knows every IANA zone, including DST rules.
import { RRule, rrulestr } from 'rrule';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(d: Date, tz: string) {
  const p = Object.fromEntries(dtf(tz).formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

function offsetMs(d: Date, tz: string): number {
  const p = zonedParts(d, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Converts a local wall time in `tz` to the UTC instant. Handles DST. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const [hh, mm] = timeStr.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - offsetMs(new Date(guess), tz);
  // Second pass corrects instants that straddle a DST change.
  ts = guess - offsetMs(new Date(ts), tz);
  return new Date(ts);
}

export function toDateStr(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function toTimeStr(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export type EventTiming = {
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  rrule: string | null;
  exdates: string[];
};

export type Occurrence = {
  allDay: boolean;
  /** Local start date (YYYY-MM-DD) in the event's timezone. */
  date: string;
  /** Last local date the occurrence covers (inclusive). */
  endDate: string;
  start: Date | null;
  end: Date | null;
};

/** Validates an RRULE body. Returns an error message or null. */
export function validateRrule(rule: string): string | null {
  try {
    const opts = RRule.parseString(rule.replace(/^RRULE:/i, ''));
    if (opts.freq === undefined) return 'Recurrence needs a frequency.';
    if (!opts.until && !opts.count) return 'Recurrence must end (set an end date or number of times).';
    return null;
  } catch {
    return 'Recurrence rule is not valid.';
  }
}

/**
 * Expands an event into occurrences overlapping [from, to] (local dates,
 * inclusive), computing recurrences in the event's own timezone so that
 * "every Friday at 8:00" stays at 8:00 across DST changes.
 */
export function expandOccurrences(e: EventTiming, from: string, to: string): Occurrence[] {
  const tz = e.timezone;
  const baseDate = e.allDay ? e.startDate! : toDateStr(e.startsAt!, tz);
  const baseTime = e.allDay ? '00:00' : toTimeStr(e.startsAt!, tz);
  const spanDays = e.allDay
    ? daysBetween(e.startDate!, e.endDate ?? e.startDate!)
    : daysBetween(baseDate, toDateStr(e.endsAt ?? e.startsAt!, tz));
  const durationMs = e.allDay ? 0 : (e.endsAt ?? e.startsAt!).getTime() - e.startsAt!.getTime();

  const make = (date: string): Occurrence => {
    if (e.allDay) return { allDay: true, date, endDate: addDays(date, spanDays), start: null, end: null };
    const start = zonedTimeToUtc(date, baseTime, tz);
    return { allDay: false, date, endDate: addDays(date, spanDays), start, end: new Date(start.getTime() + durationMs) };
  };

  let dates: string[];
  if (!e.rrule) {
    dates = [baseDate];
  } else {
    // "Floating" UTC dates stand in for local wall-clock dates.
    const [y, m, d] = baseDate.split('-').map(Number) as [number, number, number];
    const rule = rrulestr(`RRULE:${e.rrule.replace(/^RRULE:/i, '')}`, { dtstart: new Date(Date.UTC(y, m - 1, d)) });
    const lo = new Date(`${addDays(from, -Math.max(spanDays, 0))}T00:00:00Z`);
    const hi = new Date(`${to}T23:59:59Z`);
    dates = rule.between(lo, hi, true).map((x) => x.toISOString().slice(0, 10));
  }
  const ex = new Set(e.exdates);
  return dates
    .filter((dt) => !ex.has(dt))
    .map(make)
    .filter((o) => o.endDate >= from && o.date <= to);
}
