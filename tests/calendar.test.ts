// Calendar services end to end against PostgreSQL: RLS on the new tables,
// grade-scoped permissions, workflow, imports without duplicates, public reads.
import { PUBLIC_VIEWER } from '@/server/viewer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { audiences, auditLogs, calendars, events, membershipRoles, memberships, roles, tenantSettings } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import {
  commitImport,
  createCalendar,
  createEvent,
  deleteEvent,
  getPublicFeed,
  listEventsForStaff,
  listPublicOccurrences,
  previewImport,
  transitionEvent,
  updateEvent,
} from '@/server/services/calendar';
import { createSchool, createUser, expectDbError } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;
let calA: string;
let calB: string;
let grade5Aud: string;
let grade6Aud: string;
let middleAud: string;

const TZ = 'America/Denver';

async function audienceId(tenantId: string, key: string) {
  return withTenant(tenantId, async (tx) => (await tx.select().from(audiences).where(eq(audiences.key, key)))[0]!.id);
}

async function addMember(tenantId: string, roleKey: string, scope?: { scopeType: 'audience'; scopeId: string }) {
  const userId = await createUser(`member-${roleKey}`);
  await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
    await tx.insert(membershipRoles).values({
      tenantId,
      membershipId: m!.id,
      roleId: r!.id,
      scopeType: scope?.scopeType ?? 'school',
      scopeId: scope?.scopeId ?? null,
    });
  });
  return { userId, ctx: (await loadAuthzContext(tenantId, userId))! };
}

const base = (calendarId: string, extra: Record<string, unknown> = {}) => ({
  calendarId,
  title: 'Back to School Night',
  allDay: false,
  startDate: '2026-09-10',
  startTime: '18:00',
  endTime: '19:30',
  timezone: TZ,
  ...extra,
});

beforeAll(async () => {
  a = await createSchool('cal-a');
  b = await createSchool('cal-b');
  calA = await withTenant(a.tenant.id, async (tx) => (await tx.select().from(calendars).where(eq(calendars.key, 'school')))[0]!.id);
  calB = await withTenant(b.tenant.id, async (tx) => (await tx.select().from(calendars).where(eq(calendars.key, 'school')))[0]!.id);
  grade5Aud = await audienceId(a.tenant.id, 'grade-5');
  grade6Aud = await audienceId(a.tenant.id, 'grade-6');
  middleAud = await audienceId(a.tenant.id, 'level-middle');
});

afterAll(async () => {
  await closeDb();
});

describe('calendar tenant isolation', () => {
  it('provisions a default public calendar per school', () => {
    expect(calA).toBeTruthy();
    expect(calB).toBeTruthy();
  });

  it('cannot read or attach events to another school calendar', async () => {
    const ev = await createEvent(a.ownerCtx, base(calA));
    const seenFromB = await withTenant(b.tenant.id, (tx) => tx.select().from(events).where(eq(events.id, ev.id)));
    expect(seenFromB).toEqual([]);
    // Service: B's calendar is invisible to A.
    await expect(createEvent(a.ownerCtx, base(calB))).rejects.toThrow(/Calendar not found/);
    // Database: even raw SQL inside A's context cannot point at B's calendar.
    await expectDbError(
      withTenant(a.tenant.id, (tx) =>
        tx.insert(events).values({ tenantId: a.tenant.id, calendarId: calB, title: 'x', timezone: TZ, allDay: true, startDate: '2026-01-01' }),
      ),
      /violates foreign key|row-level security/,
    );
    await expectDbError(
      withTenant(a.tenant.id, (tx) =>
        tx.insert(events).values({ tenantId: b.tenant.id, calendarId: calB, title: 'x', timezone: TZ, allDay: true, startDate: '2026-01-01' }),
      ),
      /row-level security/,
    );
  });

  it('only calendars.manage can create calendars, and keys are unique per school', async () => {
    const teacher = await addMember(a.tenant.id, 'teacher');
    await expect(createCalendar(teacher.ctx, { key: 'sports', name: 'Sports', color: '#006D8F', isPublic: true })).rejects.toThrow(
      /calendars.manage/,
    );
    await createCalendar(a.ownerCtx, { key: 'sports', name: 'Sports', color: '#006D8F', isPublic: true });
    await expect(createCalendar(a.ownerCtx, { key: 'sports', name: 'Again', color: '#006D8F', isPublic: true })).rejects.toThrow(
      /already exists/,
    );
    // Same key in another school is fine.
    await createCalendar(b.ownerCtx, { key: 'sports', name: 'Sports', color: '#006D8F', isPublic: true });
  });
});

describe('event validation', () => {
  it('rejects bad input with clear messages', async () => {
    await expect(createEvent(a.ownerCtx, base(calA, { endTime: '17:00' }))).rejects.toThrow(/ends before it starts/);
    await expect(createEvent(a.ownerCtx, base(calA, { startTime: null }))).rejects.toThrow(/Start time is required/);
    await expect(createEvent(a.ownerCtx, base(calA, { timezone: 'Mars/Base' }))).rejects.toThrow(/time zone/);
    await expect(createEvent(a.ownerCtx, base(calA, { rrule: 'FREQ=WEEKLY' }))).rejects.toThrow(/must end/);
    await expect(createEvent(a.ownerCtx, base(calA, { registrationUrl: 'javascript:alert(1)' }))).rejects.toThrow(/https/);
    await expect(createEvent(a.ownerCtx, { ...base(calA), tenantId: b.tenant.id })).rejects.toThrow();
  });

  it('stores timed events as instants in the school timezone', async () => {
    const ev = await createEvent(a.ownerCtx, base(calA));
    expect(ev.startsAt!.toISOString()).toBe('2026-09-11T00:00:00.000Z');
    expect(ev.endsAt!.toISOString()).toBe('2026-09-11T01:30:00.000Z');
    expect(ev.status).toBe('draft');
  });
});

describe('grade-scoped teachers', () => {
  it('can manage events for their grade only', async () => {
    const t5 = await addMember(a.tenant.id, 'teacher', { scopeType: 'audience', scopeId: grade5Aud });
    const own = await createEvent(t5.ctx, base(calA, { title: '5th grade field trip', audienceIds: [grade5Aud] }));
    await expect(createEvent(t5.ctx, base(calA, { title: 'Whole school' }))).rejects.toThrow(/events.create/);
    await expect(createEvent(t5.ctx, base(calA, { audienceIds: [grade6Aud] }))).rejects.toThrow(/events.create/);
    // Cannot widen their own event to the whole school.
    await expect(updateEvent(t5.ctx, own.id, base(calA, { title: 'Now for everyone', audienceIds: [] }))).rejects.toThrow(/events.edit/);
    // Cannot publish (teacher template has no publish).
    await expect(transitionEvent(t5.ctx, own.id, 'publish')).rejects.toThrow(/events.publish/);
    // Their staff list hides events outside their grade.
    const list = await listEventsForStaff(t5.ctx);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.audienceIds.length === 1 && e.audienceIds[0] === grade5Aud)).toBe(true);
  });

  it('a level audience (Middle School) needs coverage of every grade in it', async () => {
    const t6 = await addMember(a.tenant.id, 'teacher', { scopeType: 'audience', scopeId: grade6Aud });
    await expect(createEvent(t6.ctx, base(calA, { audienceIds: [middleAud] }))).rejects.toThrow(/events.create/);
  });
});

describe('workflow', () => {
  it('publishes directly when the school does not require approval', async () => {
    const ev = await createEvent(a.ownerCtx, base(calA, { title: 'Direct publish' }));
    const pub = await transitionEvent(a.ownerCtx, ev.id, 'publish');
    expect(pub.status).toBe('published');
    await expect(transitionEvent(a.ownerCtx, ev.id, 'publish')).rejects.toThrow(/already published/);
    const logs = await platformDb().select().from(auditLogs).where(and(eq(auditLogs.targetId, ev.id), eq(auditLogs.action, 'event.publish')));
    expect(logs).toHaveLength(1);
  });

  it('with approval required: review, independent approval, then publish', async () => {
    await platformDb().update(tenantSettings).set({ requireApproval: true }).where(eq(tenantSettings.tenantId, b.tenant.id));
    const comms = await addMember(b.tenant.id, 'communications_manager');
    const ev = await createEvent(comms.ctx, base(calB, { title: 'Needs approval' }));
    await expect(transitionEvent(comms.ctx, ev.id, 'publish')).rejects.toThrow(/requires approval/);
    await transitionEvent(comms.ctx, ev.id, 'submit');
    await expect(transitionEvent(comms.ctx, ev.id, 'approve')).rejects.toThrow(/Someone else must approve/);
    await transitionEvent(b.ownerCtx, ev.id, 'approve');
    expect((await transitionEvent(comms.ctx, ev.id, 'publish')).status).toBe('published');
  });

  it('editing a published event requires publish rights', async () => {
    const editor = await addMember(a.tenant.id, 'content_editor');
    const ev = await createEvent(editor.ctx, base(calA, { title: 'Editor event' }));
    await updateEvent(editor.ctx, ev.id, base(calA, { title: 'Editor event v2' }));
    await transitionEvent(a.ownerCtx, ev.id, 'publish');
    await expect(updateEvent(editor.ctx, ev.id, base(calA, { title: 'Sneaky change' }))).rejects.toThrow(/events.publish/);
  });

  it('delete needs events.delete', async () => {
    const editor = await addMember(a.tenant.id, 'content_editor');
    const ev = await createEvent(editor.ctx, base(calA, { title: 'To delete' }));
    await expect(deleteEvent(editor.ctx, ev.id)).rejects.toThrow(/events.delete/);
    await deleteEvent(a.ownerCtx, ev.id);
  });
});

describe('family-facing reads', () => {
  it('shows only published events from public calendars, with recurrences expanded', async () => {
    const priv = await createCalendar(a.ownerCtx, { key: 'staff-only', name: 'Staff', color: '#333333', isPublic: false });
    const mass = await createEvent(
      a.ownerCtx,
      base(calA, { title: 'Friday Mass', startDate: '2026-10-23', startTime: '08:00', endTime: '09:00', rrule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=4' }),
    );
    await transitionEvent(a.ownerCtx, mass.id, 'publish');
    const hidden = await createEvent(a.ownerCtx, base(priv.id, { title: 'Staff meeting', startDate: '2026-10-23' }));
    await transitionEvent(a.ownerCtx, hidden.id, 'publish');
    await createEvent(a.ownerCtx, base(calA, { title: 'Draft only', startDate: '2026-10-23' }));

    const occ = await listPublicOccurrences(a.tenant.id, PUBLIC_VIEWER, { from: '2026-10-01', to: '2026-11-30' });
    const titles = occ.map((o) => o.title);
    expect(titles.filter((t) => t === 'Friday Mass')).toHaveLength(4);
    expect(titles).not.toContain('Staff meeting');
    expect(titles).not.toContain('Draft only');
    // DST: 8:00 local stays 8:00 local.
    const nov = occ.find((o) => o.title === 'Friday Mass' && o.date === '2026-11-06')!;
    expect(nov.start!.toISOString()).toBe('2026-11-06T15:00:00.000Z');
    // Other schools see none of it.
    expect(await listPublicOccurrences(b.tenant.id, PUBLIC_VIEWER, { from: '2026-10-01', to: '2026-11-30' })).not.toContainEqual(
      expect.objectContaining({ title: 'Friday Mass' }),
    );
    expect(await getPublicFeed(a.tenant.id, 'staff-only')).toBeNull();
  });

  it('filters by audience while keeping whole-school events', async () => {
    const g5 = await createEvent(a.ownerCtx, base(calA, { title: 'G5 only', startDate: '2026-12-02', audienceIds: [grade5Aud] }));
    const all = await createEvent(a.ownerCtx, base(calA, { title: 'Everyone', startDate: '2026-12-02' }));
    await transitionEvent(a.ownerCtx, g5.id, 'publish');
    await transitionEvent(a.ownerCtx, all.id, 'publish');
    const for6 = await listPublicOccurrences(a.tenant.id, PUBLIC_VIEWER, { from: '2026-12-01', to: '2026-12-03' }, { audienceIds: [grade6Aud] });
    expect(for6.map((o) => o.title)).toEqual(['Everyone']);
    const for5 = await listPublicOccurrences(a.tenant.id, PUBLIC_VIEWER, { from: '2026-12-01', to: '2026-12-03' }, { audienceIds: [grade5Aud] });
    expect(for5.map((o) => o.title).sort()).toEqual(['Everyone', 'G5 only']);
  });
});

const ICS = (title: string) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'X-WR-TIMEZONE:America/Denver',
    'BEGIN:VEVENT',
    'UID:break@example.test',
    'DTSTART;VALUE=DATE:20270315',
    'DTEND;VALUE=DATE:20270320',
    `SUMMARY:${title}`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:conf@example.test',
    'DTSTART;TZID=America/Denver:20270210T150000',
    'DTEND;TZID=America/Denver:20270210T190000',
    'SUMMARY:Parent-Teacher Conferences',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:dup@example.test',
    'DTSTART;VALUE=DATE:20270401',
    'SUMMARY:Field Day',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

describe('imports', () => {
  it('previews, commits, and re-imports without duplicates', async () => {
    const cal = await createCalendar(a.ownerCtx, { key: 'imported', name: 'Imported', color: '#16335B', isPublic: true });
    // A manually created event that the file also contains.
    await createEvent(a.ownerCtx, base(cal.id, { title: 'Field day', allDay: true, startDate: '2027-04-01', startTime: null, endTime: null }));

    const p1 = await previewImport(a.ownerCtx, { calendarId: cal.id, kind: 'ics_file', fileName: 'school.ics', text: ICS('Spring Break'), timezone: TZ });
    expect(p1.counts).toMatchObject({ new: 2, duplicate: 1 });
    // Nothing is written by a preview.
    const before = await withTenant(a.tenant.id, (tx) => tx.select().from(events).where(eq(events.calendarId, cal.id)));
    expect(before).toHaveLength(1);

    const r1 = await commitImport(a.ownerCtx, p1.importId, { publish: true });
    expect(r1).toEqual({ created: 2, updated: 0, cancelled: 0, skipped: 1 });
    await expect(commitImport(a.ownerCtx, p1.importId, { publish: true })).rejects.toThrow(/already completed/);

    const p2 = await previewImport(a.ownerCtx, { calendarId: cal.id, kind: 'ics_file', text: ICS('Spring Break'), timezone: TZ });
    expect(p2.counts).toMatchObject({ new: 0, unchanged: 2, duplicate: 1 });

    const p3 = await previewImport(a.ownerCtx, { calendarId: cal.id, kind: 'ics_file', text: ICS('Spring Break - No School'), timezone: TZ });
    expect(p3.counts).toMatchObject({ update: 1, unchanged: 1 });
    expect(await commitImport(a.ownerCtx, p3.importId, {})).toMatchObject({ updated: 1, created: 0 });

    const rows = await withTenant(a.tenant.id, (tx) => tx.select().from(events).where(eq(events.calendarId, cal.id)));
    expect(rows).toHaveLength(3);
    const brk = rows.find((r) => r.externalUid === 'break@example.test')!;
    expect(brk).toMatchObject({ title: 'Spring Break - No School', startDate: '2027-03-15', endDate: '2027-03-19', status: 'published' });
    const conf = rows.find((r) => r.externalUid === 'conf@example.test')!;
    expect(conf.startsAt!.toISOString()).toBe('2027-02-10T22:00:00.000Z');
  });

  it('can import a flagged duplicate on request', async () => {
    const cal = await createCalendar(a.ownerCtx, { key: 'imported-2', name: 'Imported 2', color: '#16335B', isPublic: true });
    await createEvent(a.ownerCtx, base(cal.id, { title: 'Field Day', allDay: true, startDate: '2027-04-01', startTime: null, endTime: null }));
    const p = await previewImport(a.ownerCtx, { calendarId: cal.id, kind: 'ics_file', text: ICS('Spring Break'), timezone: TZ });
    const dupRow = p.items.find((i) => i.action === 'duplicate')!.row;
    expect(await commitImport(a.ownerCtx, p.importId, { includeDuplicateRows: [dupRow] })).toMatchObject({ created: 3, skipped: 0 });
  });

  it('imports CSV with per-row errors, and respects import/publish permissions', async () => {
    const csv = 'Title,Date,Time\nBook Fair,3/3/2027,8:00 am\nBad row,31/31/2027,\n';
    const editor = await addMember(a.tenant.id, 'content_editor');
    await expect(
      previewImport(editor.ctx, { calendarId: calA, kind: 'csv_file', text: csv, timezone: TZ, csvMapping: { title: 'Title', startDate: 'Date', startTime: 'Time' } }),
    ).rejects.toThrow(/events.import/);

    const comms = await addMember(a.tenant.id, 'communications_manager');
    const p = await previewImport(comms.ctx, {
      calendarId: calA,
      kind: 'csv_file',
      text: csv,
      timezone: TZ,
      csvMapping: { title: 'Title', startDate: 'Date', startTime: 'Time' },
    });
    expect(p.counts.new).toBe(1);
    expect(p.errors).toEqual([{ row: 3, message: expect.stringMatching(/not a date/) }]);
    const t5 = await addMember(a.tenant.id, 'teacher', { scopeType: 'audience', scopeId: grade5Aud });
    await expect(commitImport(t5.ctx, p.importId, {})).rejects.toThrow(/events.import/);
    expect(await commitImport(comms.ctx, p.importId, { audienceIds: [grade5Aud] })).toMatchObject({ created: 1 });
  });

  it('import previews are invisible to other schools', async () => {
    const p = await previewImport(a.ownerCtx, { calendarId: calA, kind: 'ics_file', text: ICS('X'), timezone: TZ });
    await expect(commitImport(b.ownerCtx, p.importId, {})).rejects.toThrow(/Import not found/);
  });
});
