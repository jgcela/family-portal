// St. Mary migration: the old portal's 132 events become an .ics file that the
// regular importer reads without errors, keeping categories, links, breaks and
// the "Important" flag; importing it twice changes nothing.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { events } from '@/server/db/schema';
import { parseIcs } from '@/server/calendar/parse';
import { buildStMaryCalendarIcs, legacyUid, type LegacyEvent } from '@/server/migration/st-mary-calendar';
import { commitImport, createCalendar, previewImport } from '@/server/services/calendar';
import { createSchool } from './helpers';

const data = JSON.parse(readFileSync('data/st-mary/events-2026-27.json', 'utf8')) as { events: LegacyEvent[] };
const ics = buildStMaryCalendarIcs(data.events);
const TZ = 'America/Denver';

let s: Awaited<ReturnType<typeof createSchool>>;
beforeAll(async () => {
  s = await createSchool('stm-cal');
});
afterAll(async () => {
  await closeDb();
});

describe('St. Mary calendar migration', () => {
  it('keeps every event of the old portal', () => {
    expect(data.events).toHaveLength(132);
    expect(new Set(data.events.map(legacyUid)).size).toBe(132);
    const parsed = parseIcs(ics, TZ);
    expect(parsed.errors).toEqual([]);
    expect(parsed.events).toHaveLength(132);
    expect(parsed.events.every((e) => e.allDay)).toBe(true);

    const thanksgiving = parsed.events.find((e) => e.title.startsWith('Thanksgiving Break'))!;
    expect([thanksgiving.startDate, thanksgiving.endDate, thanksgiving.category]).toEqual(['2026-11-25', '2026-11-29', 'no school']);
    const christmas = parsed.events.find((e) => e.title.startsWith('Christmas Break'))!;
    expect([christmas.startDate, christmas.endDate]).toEqual(['2026-12-21', '2027-01-04']);

    const important = data.events.filter((e) => e.tags.includes('Important')).length;
    expect(parsed.events.filter((e) => e.important)).toHaveLength(important);
    expect(parsed.events.find((e) => e.title === 'Exemption certificates')?.url).toBe('https://cdphe.colorado.gov/exemptions-to-school-required-vaccines');
    expect(new Set(parsed.events.map((e) => e.category))).toEqual(new Set(['no school', 'faith', 'academic', 'community', 'health']));
  });

  it('imports once, with the Important flag, and a second import changes nothing', async () => {
    const cal = await createCalendar(s.ownerCtx, { key: 'stmary-2627', name: 'St. Mary 2026–27', color: '#16335B', isPublic: true });
    const p1 = await previewImport(s.ownerCtx, { calendarId: cal.id, kind: 'ics_file', fileName: 'st-mary.ics', text: ics, timezone: TZ });
    expect(p1.errors).toEqual([]);
    expect(await commitImport(s.ownerCtx, p1.importId, { publish: true })).toMatchObject({ created: 132, updated: 0 });

    const rows = await withTenant(s.tenant.id, (tx) => tx.select().from(events).where(eq(events.calendarId, cal.id)));
    expect(rows).toHaveLength(132);
    expect(rows.filter((r) => r.isImportant)).toHaveLength(data.events.filter((e) => e.tags.includes('Important')).length);
    expect(rows.every((r) => r.status === 'published')).toBe(true);

    const p2 = await previewImport(s.ownerCtx, { calendarId: cal.id, kind: 'ics_file', text: ics, timezone: TZ });
    expect(p2.counts).toMatchObject({ new: 0, update: 0, unchanged: 132 });
  });
});
