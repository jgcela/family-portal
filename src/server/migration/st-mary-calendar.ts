// St. Mary 2026–27 calendar: turns the events copied from the old portal
// (data/st-mary/events-2026-27.json, the EVENTS list of portal_202627.html)
// into an .ics file the school imports from Admin › Calendar › Import.
// Nothing is invented: titles, details, links and dates are the old portal's.
import { buildIcs, type ExportEvent } from '../calendar/ics-export';

export type LegacyEvent = {
  date: string;
  category: 'noclasses' | 'faith' | 'academic' | 'community' | 'health';
  title: string;
  detail: string;
  tags: string[];
  url: string | null;
  /** Last day of a multi-day break (the old portal's "no school" banner end). */
  alertUntil: string | null;
};

// The old portal's own labels for its categories.
export const LEGACY_CATEGORY_LABEL: Record<LegacyEvent['category'], string> = {
  noclasses: 'No school',
  faith: 'Faith',
  academic: 'Academic',
  community: 'Community',
  health: 'Health',
};

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** Same UID every time, so importing the file again updates instead of duplicating. */
export const legacyUid = (e: LegacyEvent) => `stmary-2627-${e.date}-${slug(e.title)}`;

export function legacyToExport(e: LegacyEvent, stamp: Date): ExportEvent {
  const end = e.alertUntil && e.alertUntil > e.date ? e.alertUntil : e.date;
  return {
    id: legacyUid(e),
    title: e.title,
    description: e.detail.trim() || null,
    location: null,
    url: e.url,
    allDay: true,
    startDate: e.date,
    endDate: end,
    startsAt: null,
    endsAt: null,
    timezone: 'America/Denver',
    rrule: null,
    exdates: [],
    updatedAt: stamp,
    category: LEGACY_CATEGORY_LABEL[e.category],
    important: e.tags.includes('Important'),
  };
}

export function buildStMaryCalendarIcs(list: LegacyEvent[], stamp = new Date('2026-11-14T00:00:00Z')): string {
  return buildIcs({
    name: 'St. Mary 2026–27 school calendar',
    domain: 'stmary.familyportal',
    events: list.map((e) => legacyToExport(e, stamp)),
  });
}
