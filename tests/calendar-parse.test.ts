// Calendar parsing, recurrence, timezones, import planning and ICS output.
// Pure functions: no database needed.
import { describe, expect, it } from 'vitest';
import { expandOccurrences, validateRrule, zonedTimeToUtc, type EventTiming } from '@/server/calendar/time';
import { guessCsvMapping, parseCsv, parseCsvDate, parseCsvTime, parseIcs, readCsvHeaders } from '@/server/calendar/parse';
import { eventHash, planImport, type ExistingEvent } from '@/server/calendar/plan';
import { buildIcs, googleCalendarLink } from '@/server/calendar/ics-export';

const TZ = 'America/Denver';

describe('time zones', () => {
  it('converts Denver wall time to UTC on both sides of DST', () => {
    expect(zonedTimeToUtc('2026-10-30', '08:00', TZ).toISOString()).toBe('2026-10-30T14:00:00.000Z'); // MDT
    expect(zonedTimeToUtc('2026-11-06', '08:00', TZ).toISOString()).toBe('2026-11-06T15:00:00.000Z'); // MST
  });

  it('keeps a weekly 8:00 event at 8:00 local across the DST change', () => {
    const e: EventTiming = {
      allDay: false,
      startDate: null,
      endDate: null,
      startsAt: zonedTimeToUtc('2026-10-23', '08:00', TZ),
      endsAt: zonedTimeToUtc('2026-10-23', '09:00', TZ),
      timezone: TZ,
      rrule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=4',
      exdates: ['2026-11-06'],
    };
    const occ = expandOccurrences(e, '2026-10-01', '2026-12-31');
    expect(occ.map((o) => o.date)).toEqual(['2026-10-23', '2026-10-30', '2026-11-13']);
    expect(occ.map((o) => o.start!.toISOString())).toEqual([
      '2026-10-23T14:00:00.000Z',
      '2026-10-30T14:00:00.000Z',
      '2026-11-13T15:00:00.000Z',
    ]);
    expect(occ[2]!.end!.getTime() - occ[2]!.start!.getTime()).toBe(3_600_000);
  });

  it('includes multi-day all-day events that started before the window', () => {
    const e: EventTiming = {
      allDay: true,
      startDate: '2026-11-25',
      endDate: '2026-11-27',
      startsAt: null,
      endsAt: null,
      timezone: TZ,
      rrule: null,
      exdates: [],
    };
    expect(expandOccurrences(e, '2026-11-26', '2026-11-30')).toHaveLength(1);
    expect(expandOccurrences(e, '2026-11-28', '2026-11-30')).toHaveLength(0);
  });

  it('requires recurrences to end', () => {
    expect(validateRrule('FREQ=WEEKLY;BYDAY=FR')).toMatch(/must end/);
    expect(validateRrule('FREQ=WEEKLY;BYDAY=FR;UNTIL=20270528')).toBeNull();
    expect(validateRrule('nonsense')).not.toBeNull();
  });
});

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:St. Mary School',
  'X-WR-TIMEZONE:America/Denver',
  'BEGIN:VEVENT',
  'UID:abc@google.com',
  'DTSTART;VALUE=DATE:20261125',
  'DTEND;VALUE=DATE:20261128',
  'SUMMARY:Thanksgiving Break - No School',
  'CATEGORIES:NoClasses',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:mass@google.com',
  'DTSTART;TZID=America/Denver:20261023T080000',
  'DTEND;TZID=America/Denver:20261023T090000',
  'RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10',
  'SUMMARY:All-School Mass',
  'LOCATION:St. Mary Church',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:mass@google.com',
  'RECURRENCE-ID;TZID=America/Denver:20261030T080000',
  'DTSTART;TZID=America/Denver:20261030T100000',
  'DTEND;TZID=America/Denver:20261030T110000',
  'SUMMARY:All-School Mass (late start)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:utc@google.com',
  'DTSTART:20261201T013000Z',
  'DTEND:20261201T023000Z',
  'SUMMARY:Board meeting',
  'URL:javascript:alert(1)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('ICS import', () => {
  const res = parseIcs(ICS, 'UTC');

  it('reads all-day ranges with an exclusive DTEND', () => {
    const tg = res.events.find((e) => e.uid === 'abc@google.com')!;
    expect(tg).toMatchObject({ allDay: true, startDate: '2026-11-25', endDate: '2026-11-27', category: 'noclasses' });
    expect(res.calendarName).toBe('St. Mary School');
  });

  it('reads TZID times and recurrence, and turns modified instances into exceptions', () => {
    const mass = res.events.find((e) => e.uid === 'mass@google.com')!;
    expect(mass.startsAt!.toISOString()).toBe('2026-10-23T14:00:00.000Z');
    expect(mass.rrule).toContain('FREQ=WEEKLY');
    expect(mass.exdates).toEqual(['2026-10-30']);
    const moved = res.events.find((e) => e.uid === 'mass@google.com#2026-10-30')!;
    expect(moved.startsAt!.toISOString()).toBe('2026-10-30T16:00:00.000Z');
  });

  it('places UTC times on the local date of the calendar timezone and drops unsafe links', () => {
    const b = res.events.find((e) => e.uid === 'utc@google.com')!;
    expect(b.startDate).toBe('2026-11-30'); // 6:30 pm in Denver
    expect(b.url).toBeNull();
  });

  it('rejects files that are not iCalendar', () => {
    expect(parseIcs('hello', TZ).errors[0]!.message).toMatch(/not a valid/);
  });
});

describe('CSV import', () => {
  it('parses US and ISO dates and 12/24h times, rejecting impossible ones', () => {
    expect(parseCsvDate('9/2/26')).toBe('2026-09-02');
    expect(parseCsvDate('2026-02-30')).toBeNull();
    expect(parseCsvTime('6:30 pm')).toBe('18:30');
    expect(parseCsvTime('12 a.m.')).toBe('00:00');
    expect(parseCsvTime('25:00')).toBeNull();
  });

  const csv = 'Subject,Start Date,Start Time,End Time,Location\nBack to School Night,9/10/2026,6:00 PM,7:30 PM,Gym\nField Day,2026-05-21,,,\n,2026-05-22,,,\nPicnic,May 3,,,\n';

  it('guesses the column mapping from common header names', () => {
    const m = guessCsvMapping(readCsvHeaders(csv));
    expect(m).toMatchObject({ title: 'Subject', startDate: 'Start Date', startTime: 'Start Time', endTime: 'End Time', location: 'Location' });
  });

  it('imports good rows and reports bad rows by line number', () => {
    const res = parseCsv(csv, guessCsvMapping(readCsvHeaders(csv)), TZ);
    expect(res.events).toHaveLength(2);
    expect(res.events[0]!.startsAt!.toISOString()).toBe('2026-09-11T00:00:00.000Z');
    expect(res.events[1]).toMatchObject({ allDay: true, startDate: '2026-05-21' });
    expect(res.errors.map((e) => e.row)).toEqual([4, 5]);
  });
});

describe('import planning (no duplicates)', () => {
  const parsed = parseIcs(ICS, 'UTC').events;

  it('creates everything on the first import', () => {
    expect(planImport(parsed, []).counts).toMatchObject({ new: 4, update: 0, duplicate: 0 });
  });

  it('re-importing the same file changes nothing', () => {
    const existing: ExistingEvent[] = parsed.map((e, i) => ({
      id: `id${i}`,
      title: e.title,
      allDay: e.allDay,
      startDate: e.startDate,
      startsAt: e.startsAt,
      timezone: e.timezone,
      externalUid: e.uid,
      externalHash: eventHash(e),
    }));
    expect(planImport(parsed, existing).counts).toMatchObject({ new: 0, unchanged: 4 });
    const edited = parsed.map((e) => (e.uid === 'abc@google.com' ? { ...e, title: 'Thanksgiving Break' } : e));
    expect(planImport(edited, existing).counts).toMatchObject({ update: 1, unchanged: 3 });
  });

  it('flags events that match a manually created event by date and title', () => {
    const manual: ExistingEvent = {
      id: 'm1',
      title: 'thanksgiving break  no school',
      allDay: true,
      startDate: '2026-11-25',
      startsAt: null,
      timezone: TZ,
      externalUid: null,
      externalHash: null,
    };
    const plan = planImport(parsed, [manual]);
    const item = plan.items.find((i) => i.event.uid === 'abc@google.com')!;
    expect(item).toMatchObject({ action: 'duplicate', existingId: 'm1' });
  });

  it('gives CSV rows without ids a stable identity', () => {
    const csv = 'Title,Date\nField Day,2026-05-21\n';
    const a = planImport(parseCsv(csv, { title: 'Title', startDate: 'Date' }, TZ).events, []).items[0]!;
    const b = planImport(parseCsv(csv, { title: 'Title', startDate: 'Date' }, TZ).events, []).items[0]!;
    expect(a.uid).toBe(b.uid);
    expect(a.uid).toMatch(/^gen:/);
  });
});

describe('ICS export', () => {
  it('round-trips through the importer', () => {
    const start = zonedTimeToUtc('2026-10-23', '08:00', TZ);
    const ics = buildIcs({
      name: 'School, Events',
      domain: 'example.test',
      events: [
        {
          id: 'e1',
          title: 'Mass; all school',
          description: 'Line 1\nLine 2 ' + 'x'.repeat(200),
          location: null,
          url: 'https://example.test/x',
          allDay: false,
          startDate: null,
          endDate: null,
          startsAt: start,
          endsAt: new Date(start.getTime() + 3_600_000),
          timezone: TZ,
          rrule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=3',
          exdates: ['2026-10-30'],
          updatedAt: new Date('2026-11-01T00:00:00Z'),
        },
        {
          id: 'e2',
          title: 'Break',
          description: null,
          location: null,
          url: null,
          allDay: true,
          startDate: '2026-11-25',
          endDate: '2026-11-27',
          startsAt: null,
          endsAt: null,
          timezone: TZ,
          rrule: null,
          exdates: [],
          updatedAt: new Date('2026-11-01T00:00:00Z'),
        },
      ],
    });
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    const back = parseIcs(ics, 'UTC');
    expect(back.errors).toEqual([]);
    expect(back.calendarName).toBe('School, Events');
    const [mass, brk] = back.events;
    expect(mass).toMatchObject({ title: 'Mass; all school', exdates: ['2026-10-30'] });
    expect(mass!.startsAt!.toISOString()).toBe(start.toISOString());
    expect(mass!.description).toContain('Line 1\nLine 2');
    expect(brk).toMatchObject({ allDay: true, startDate: '2026-11-25', endDate: '2026-11-27' });
  });

  it('builds Google Calendar links with an exclusive all-day end', () => {
    const url = googleCalendarLink({ title: 'Break', allDay: true, date: '2026-11-25', endDate: '2026-11-27', start: null, end: null });
    expect(new URL(url).searchParams.get('dates')).toBe('20261125/20261128');
  });
});
