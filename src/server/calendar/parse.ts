// Calendar file parsing (ICS and CSV) into one normalized shape.
import ICAL from 'ical.js';
import Papa from 'papaparse';
import { addDays, isValidTimeZone, toDateStr, zonedTimeToUtc } from './time';

export type ParsedEvent = {
  /** 1-based position in the source, for error messages. */
  row: number;
  uid: string | null;
  title: string;
  description: string | null;
  location: string | null;
  category: string | null;
  url: string | null;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  rrule: string | null;
  exdates: string[];
  cancelled: boolean;
  /** Marked important in the source (ICS PRIORITY 1–4 or an "Important" category; CSV column). */
  important?: boolean;
};

export type ParseError = { row: number; message: string };
export type ParseResult = { events: ParsedEvent[]; errors: ParseError[]; calendarName: string | null };

const MAX_EVENTS = 5000;

function clean(s: unknown, max = 5000): string | null {
  if (typeof s !== 'string') return null;
  const v = s.replace(/\r\n?/g, '\n').trim();
  return v ? v.slice(0, max) : null;
}

function safeUrl(s: string | null): string | null {
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// ---------- ICS ----------

type ICALTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isDate: boolean;
  zone?: { tzid?: string };
  timezone?: string;
};

function timeToInstant(t: ICALTime, tzid: string | null, fallbackTz: string): { date: Date; tz: string } {
  const dateStr = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const timeStr = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
  const zoneId = tzid ?? t.zone?.tzid ?? null;
  if (zoneId === 'UTC' || zoneId === 'Z') {
    return { date: new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute)), tz: fallbackTz };
  }
  const tz = zoneId && isValidTimeZone(zoneId) ? zoneId : fallbackTz;
  return { date: zonedTimeToUtc(dateStr, timeStr, tz), tz };
}

function icalDateStr(t: ICALTime) {
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

export function parseIcs(text: string, defaultTz: string): ParseResult {
  const errors: ParseError[] = [];
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    return { events: [], errors: [{ row: 0, message: 'This file is not a valid iCalendar (.ics) file.' }], calendarName: null };
  }
  const calTz = (root.getFirstPropertyValue('x-wr-timezone') as string | null) ?? null;
  const fallbackTz = calTz && isValidTimeZone(calTz) ? calTz : defaultTz;
  // X- properties are not unescaped by ical.js.
  const rawName = root.getFirstPropertyValue('x-wr-calname');
  const calendarName = clean(
    typeof rawName === 'string' ? rawName.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ') : null,
    200,
  );

  const vevents = root.getAllSubcomponents('vevent');
  if (vevents.length > MAX_EVENTS) {
    return { events: [], errors: [{ row: 0, message: `Too many events (${vevents.length}). The limit is ${MAX_EVENTS}.` }], calendarName };
  }

  const events: ParsedEvent[] = [];
  const overrides: { uid: string; date: string }[] = [];

  vevents.forEach((ve, i) => {
    const row = i + 1;
    try {
      const startProp = ve.getFirstProperty('dtstart');
      if (!startProp) throw new Error('Missing start date.');
      const start = startProp.getFirstValue() as unknown as ICALTime;
      const startTzid = (startProp.getParameter('tzid') as string | undefined) ?? null;
      const endProp = ve.getFirstProperty('dtend');
      const end = (endProp?.getFirstValue() as unknown as ICALTime | undefined) ?? null;
      const endTzid = (endProp?.getParameter('tzid') as string | undefined) ?? startTzid;
      const title = clean(ve.getFirstPropertyValue('summary'), 300) ?? '(Untitled event)';
      let uid = clean(ve.getFirstPropertyValue('uid'), 500);
      const recurrenceId = ve.getFirstPropertyValue('recurrence-id') as unknown as ICALTime | null;
      if (uid && recurrenceId) {
        overrides.push({ uid, date: icalDateStr(recurrenceId) });
        uid = `${uid}#${icalDateStr(recurrenceId)}`;
      }

      const allDay = start.isDate;
      let ev: Pick<ParsedEvent, 'startDate' | 'endDate' | 'startsAt' | 'endsAt' | 'timezone'>;
      if (allDay) {
        const s = icalDateStr(start);
        // DTEND is exclusive for all-day events.
        const e = end ? addDays(icalDateStr(end), -1) : s;
        ev = { startDate: s, endDate: e < s ? s : e, startsAt: null, endsAt: null, timezone: fallbackTz };
      } else {
        const s = timeToInstant(start, startTzid, fallbackTz);
        const e = end ? timeToInstant(end, endTzid, fallbackTz).date : s.date;
        ev = {
          startDate: toDateStr(s.date, s.tz),
          endDate: toDateStr(e, s.tz),
          startsAt: s.date,
          endsAt: e < s.date ? s.date : e,
          timezone: s.tz,
        };
      }
      const rruleProp = ve.getFirstPropertyValue('rrule');
      const exdates = ve
        .getAllProperties('exdate')
        .flatMap((p) => p.getValues() as unknown as ICALTime[])
        .map((t) => (t.isDate ? icalDateStr(t) : toDateStr(timeToInstant(t, null, ev.timezone).date, ev.timezone)));
      const allCategories = ve
        .getAllProperties('categories')
        .flatMap((p) => p.getValues() as string[])
        .map((c) => String(c).trim())
        .filter(Boolean);
      // "Important" is a flag, not a category.
      const flagged = allCategories.some((c) => c.toLowerCase() === 'important');
      const categories = allCategories.filter((c) => c.toLowerCase() !== 'important');
      const priority = Number(ve.getFirstPropertyValue('priority') ?? 0);
      const important = flagged || (priority >= 1 && priority <= 4);

      events.push({
        row,
        uid,
        title,
        description: clean(ve.getFirstPropertyValue('description')),
        location: clean(ve.getFirstPropertyValue('location'), 500),
        category: clean(categories[0], 60)?.toLowerCase() ?? null,
        url: safeUrl(clean(ve.getFirstPropertyValue('url'), 2048)),
        allDay,
        ...ev,
        rrule: rruleProp ? String(rruleProp.toString()) : null,
        exdates,
        cancelled: String(ve.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED',
        important,
      });
    } catch (err) {
      errors.push({ row, message: err instanceof Error ? err.message : 'Could not read this event.' });
    }
  });

  // Modified instances replace that date of their recurring series.
  for (const o of overrides) {
    const master = events.find((e) => e.uid === o.uid && e.rrule);
    if (master && !master.exdates.includes(o.date)) master.exdates.push(o.date);
  }
  return { events, errors, calendarName };
}

// ---------- CSV ----------

export const CSV_FIELDS = [
  'title',
  'startDate',
  'startTime',
  'endDate',
  'endTime',
  'allDay',
  'location',
  'description',
  'category',
  'uid',
  'url',
  'important',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export type CsvMapping = Partial<Record<CsvField, string>>;

const SYNONYMS: Record<CsvField, string[]> = {
  title: ['title', 'subject', 'event', 'name', 'summary', 'event name'],
  startDate: ['start date', 'date', 'start', 'startdate', 'begin date'],
  startTime: ['start time', 'time', 'starttime', 'from'],
  endDate: ['end date', 'enddate', 'end'],
  endTime: ['end time', 'endtime', 'to'],
  allDay: ['all day', 'all day event', 'allday', 'all-day'],
  location: ['location', 'where', 'place'],
  description: ['description', 'details', 'notes', 'detail'],
  category: ['category', 'type', 'categories'],
  uid: ['uid', 'id', 'event id', 'external id'],
  url: ['url', 'link', 'registration link', 'website'],
  important: ['important', 'priority', 'highlight'],
};

export function guessCsvMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  const norm = (h: string) => h.trim().toLowerCase().replace(/[_]+/g, ' ');
  for (const field of CSV_FIELDS) {
    const hit = headers.find((h) => SYNONYMS[field].includes(norm(h)));
    if (hit && !Object.values(mapping).includes(hit)) mapping[field] = hit;
  }
  return mapping;
}

export function parseCsvDate(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return fmtDate(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return fmtDate(y, +m[1]!, +m[2]!);
  }
  return null;
}

function fmtDate(y: number, mo: number, d: number): string | null {
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

export function parseCsvTime(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/\./g, '');
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = +m[1]!;
  const min = m[2] ? +m[2] : 0;
  const ap = m[3];
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith('p') && h !== 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function readCsvHeaders(text: string): string[] {
  const res = Papa.parse<string[]>(text, { preview: 1, skipEmptyLines: true });
  return (res.data[0] ?? []).map((h) => String(h).trim()).filter(Boolean);
}

export function parseCsv(text: string, mapping: CsvMapping, tz: string): ParseResult {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  const errors: ParseError[] = [];
  const events: ParsedEvent[] = [];
  if (!mapping.title || !mapping.startDate) {
    return { events, errors: [{ row: 0, message: 'Choose which columns hold the title and the start date.' }], calendarName: null };
  }
  if (res.data.length > MAX_EVENTS) {
    return { events, errors: [{ row: 0, message: `Too many rows (${res.data.length}). The limit is ${MAX_EVENTS}.` }], calendarName: null };
  }
  const get = (r: Record<string, string>, f: CsvField) => (mapping[f] ? (r[mapping[f]!] ?? '').trim() : '');

  res.data.forEach((r, i) => {
    const row = i + 2; // header is row 1
    const title = clean(get(r, 'title'), 300);
    const startDate = parseCsvDate(get(r, 'startDate'));
    if (!title) return errors.push({ row, message: 'Missing title.' });
    if (!startDate) return errors.push({ row, message: `Start date "${get(r, 'startDate')}" is not a date (use YYYY-MM-DD or M/D/YYYY).` });
    const endDateRaw = get(r, 'endDate');
    const endDate = endDateRaw ? parseCsvDate(endDateRaw) : startDate;
    if (!endDate) return errors.push({ row, message: `End date "${endDateRaw}" is not a date.` });
    const stRaw = get(r, 'startTime');
    const etRaw = get(r, 'endTime');
    const allDayFlag = /^(true|yes|y|1|x)$/i.test(get(r, 'allDay'));
    const st = stRaw ? parseCsvTime(stRaw) : null;
    if (stRaw && !st) return errors.push({ row, message: `Start time "${stRaw}" is not a time (e.g. 6:30 pm or 18:30).` });
    const et = etRaw ? parseCsvTime(etRaw) : null;
    if (etRaw && !et) return errors.push({ row, message: `End time "${etRaw}" is not a time.` });
    const allDay = allDayFlag || !st;
    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    if (!allDay) {
      startsAt = zonedTimeToUtc(startDate, st!, tz);
      endsAt = et ? zonedTimeToUtc(endDate, et, tz) : startsAt;
      if (endsAt < startsAt) return errors.push({ row, message: 'The event ends before it starts.' });
    } else if (endDate < startDate) {
      return errors.push({ row, message: 'The event ends before it starts.' });
    }
    events.push({
      row,
      uid: clean(get(r, 'uid'), 500),
      title,
      description: clean(get(r, 'description')),
      location: clean(get(r, 'location'), 500),
      category: clean(get(r, 'category'), 60)?.toLowerCase() ?? null,
      url: safeUrl(clean(get(r, 'url'), 2048)),
      allDay,
      startDate,
      endDate,
      startsAt,
      endsAt,
      timezone: tz,
      rrule: null,
      exdates: [],
      cancelled: false,
      important: /^(true|yes|y|1|x|important|high)$/i.test(get(r, 'important')),
    });
  });
  return { events, errors, calendarName: null };
}
