// Writes the St. Mary 2026–27 calendar as an .ics file for Admin › Calendar › Import.
//   npx tsx scripts/st-mary-calendar.cts [output.ics]
// (.cts: the rrule package only loads as CommonJS under plain Node.)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildStMaryCalendarIcs, type LegacyEvent } from '../src/server/migration/st-mary-calendar';

const data = JSON.parse(readFileSync(join(__dirname, '../data/st-mary/events-2026-27.json'), 'utf8')) as { events: LegacyEvent[] };
const out = process.argv[2] ?? 'st-mary-calendar-2026-27.ics';
writeFileSync(out, buildStMaryCalendarIcs(data.events));
console.log(`Wrote ${data.events.length} events to ${out}`);
