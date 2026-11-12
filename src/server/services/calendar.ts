// Calendar & Events services. Every write checks permissions against the
// event's audiences (so a grade-scoped coordinator only touches their grades),
// runs inside withTenant() (RLS) and writes an audit entry in the same
// transaction.
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { audienceGrades, audiences, calendarImports, calendars, events, tenantSettings } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, assertCan, can, canApprove, hasAnywhere, type AuthzContext, type ResourceRef } from '../rbac/authorize';
import { ValidationError } from './modules';
import { addDays, expandOccurrences, isValidTimeZone, toDateStr, validateRrule, zonedTimeToUtc, type Occurrence } from '../calendar/time';
import { parseCsv, parseIcs, type CsvMapping, type ParseError, type ParsedEvent } from '../calendar/parse';
import { planImport, type ImportPlan, type PlanAction } from '../calendar/plan';

type EventRow = typeof events.$inferSelect;
type CalendarRow = typeof calendars.$inferSelect;

const HEX = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

// ---------- Resource scoping ----------

/** Builds the authorization resource for an event's audiences (audiences → grades). */
async function eventResource(tx: Tx, audienceIds: string[], authorUserId: string | null): Promise<ResourceRef> {
  if (!audienceIds.length) return { audienceIds: [], gradeIds: [], authorUserId };
  const found = await tx.select({ id: audiences.id }).from(audiences).where(inArray(audiences.id, audienceIds));
  if (found.length !== new Set(audienceIds).size) throw new ValidationError('One of the selected audiences does not exist.');
  const g = await tx
    .selectDistinct({ gradeId: audienceGrades.gradeId })
    .from(audienceGrades)
    .where(inArray(audienceGrades.audienceId, audienceIds));
  return { audienceIds, gradeIds: g.map((x) => x.gradeId), authorUserId };
}

async function settingsFor(tx: Tx, tenantId: string) {
  const [s] = await tx.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  return { requireApproval: s?.requireApproval ?? false, independentApproval: s?.independentApproval ?? true };
}

// ---------- Calendars ----------

export const calendarInputSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Use lowercase letters, numbers and hyphens (max 40).'),
    name: z.string().trim().min(1, 'Name is required.').max(80),
    description: z.string().trim().max(500).nullish(),
    color: z.string().regex(HEX, 'Color must look like #1F3A5F.'),
    isPublic: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

export async function listCalendars(tenantId: string, db: Db = platformDb()): Promise<CalendarRow[]> {
  return withTenant(tenantId, (tx) => tx.select().from(calendars).orderBy(asc(calendars.sortOrder), asc(calendars.name)), db);
}

export async function createCalendar(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'calendars.manage');
  const parsed = calendarInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [dupe] = await tx.select({ id: calendars.id }).from(calendars).where(eq(calendars.key, parsed.data.key));
      if (dupe) throw new ValidationError(`A calendar with the key "${parsed.data.key}" already exists.`);
      const [row] = await tx
        .insert(calendars)
        .values({ ...parsed.data, tenantId: ctx.tenantId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'calendar.created', targetType: 'calendar', targetId: row!.id });
      return row!;
    },
    db,
  );
}

export async function updateCalendar(ctx: AuthzContext, calendarId: string, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'calendars.manage');
  const parsed = calendarInputSchema.omit({ key: true }).safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [row] = await tx.update(calendars).set(parsed.data).where(eq(calendars.id, calendarId)).returning();
      if (!row) throw new ValidationError('Calendar not found.');
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'calendar.updated', targetType: 'calendar', targetId: row.id });
      return row;
    },
    db,
  );
}

// ---------- Events ----------

export const eventInputSchema = z
  .object({
    calendarId: z.uuid(),
    title: z.string().trim().min(1, 'Title is required.').max(300),
    description: z.string().trim().max(5000).nullish(),
    location: z.string().trim().max(500).nullish(),
    category: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{1,40}$/, 'Category: letters, numbers and hyphens.')
      .nullish(),
    allDay: z.boolean(),
    startDate: z.string().regex(DATE, 'Start date is required.'),
    endDate: z.string().regex(DATE).nullish(),
    startTime: z.string().regex(TIME).nullish(),
    endTime: z.string().regex(TIME).nullish(),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone.'),
    rrule: z.string().trim().max(500).nullish(),
    exdates: z.array(z.string().regex(DATE)).max(500).default([]),
    registrationUrl: z
      .url({ protocol: /^https?$/, message: 'Link must start with https://' })
      .max(2048)
      .nullish(),
    audienceIds: z.array(z.uuid()).max(50).default([]),
    isImportant: z.boolean().default(false),
  })
  .strict();

export type EventInput = z.input<typeof eventInputSchema>;

/** Normalizes form input into stored columns, with the cross-field checks. */
function toColumns(input: z.output<typeof eventInputSchema>) {
  const endDate = input.endDate || input.startDate;
  if (endDate < input.startDate) throw new ValidationError('The event ends before it starts.');
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  if (!input.allDay) {
    if (!input.startTime) throw new ValidationError('Start time is required (or mark the event as all day).');
    startsAt = zonedTimeToUtc(input.startDate, input.startTime, input.timezone);
    endsAt = input.endTime ? zonedTimeToUtc(endDate, input.endTime, input.timezone) : startsAt;
    if (endsAt < startsAt) throw new ValidationError('The event ends before it starts.');
  }
  const rrule = input.rrule ? input.rrule.replace(/^RRULE:/i, '') : null;
  if (rrule) {
    const err = validateRrule(rrule);
    if (err) throw new ValidationError(err);
  }
  return {
    calendarId: input.calendarId,
    title: input.title,
    description: input.description || null,
    location: input.location || null,
    category: input.category || null,
    allDay: input.allDay,
    startDate: input.allDay ? input.startDate : null,
    endDate: input.allDay ? endDate : null,
    startsAt,
    endsAt,
    timezone: input.timezone,
    rrule,
    exdates: [...new Set(input.exdates)].sort(),
    registrationUrl: input.registrationUrl || null,
    audienceIds: [...new Set(input.audienceIds)],
    isImportant: input.isImportant,
  };
}

async function loadEvent(tx: Tx, id: string): Promise<EventRow> {
  const [row] = await tx.select().from(events).where(eq(events.id, id));
  if (!row) throw new ValidationError('Event not found.');
  return row;
}

async function assertCalendarExists(tx: Tx, calendarId: string) {
  const [c] = await tx.select({ id: calendars.id }).from(calendars).where(eq(calendars.id, calendarId));
  if (!c) throw new ValidationError('Calendar not found.');
}

export async function createEvent(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  const cols = toColumns(parsed.data);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      assertCan(ctx, 'events.create', await eventResource(tx, cols.audienceIds, ctx.userId));
      await assertCalendarExists(tx, cols.calendarId);
      const [row] = await tx
        .insert(events)
        .values({ ...cols, tenantId: ctx.tenantId, status: 'draft', createdByUserId: ctx.userId, updatedByUserId: ctx.userId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'event.created', targetType: 'event', targetId: row!.id });
      return row!;
    },
    db,
  );
}

export async function updateEvent(ctx: AuthzContext, eventId: string, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  const cols = toColumns(parsed.data);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const current = await loadEvent(tx, eventId);
      // Must be allowed to edit the event as it is AND as it will be
      // (stops a grade coordinator from moving an event to the whole school).
      assertCan(ctx, 'events.edit', await eventResource(tx, current.audienceIds, current.createdByUserId));
      const next = await eventResource(tx, cols.audienceIds, current.createdByUserId);
      assertCan(ctx, 'events.edit', next);
      // Changing what families already see requires publish rights.
      if (current.status === 'published') assertCan(ctx, 'events.publish', next);
      await assertCalendarExists(tx, cols.calendarId);
      const [row] = await tx
        .update(events)
        .set({ ...cols, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'event.updated', targetType: 'event', targetId: eventId });
      return row!;
    },
    db,
  );
}

export type EventTransition = 'submit' | 'approve' | 'publish' | 'unpublish' | 'archive' | 'restore';

/**
 * Workflow: Draft → (In review → Approved) → Published → Archived.
 * When the school requires approval, publishing needs an approved event, and
 * with independent approval nobody approves their own event.
 */
export async function transitionEvent(ctx: AuthzContext, eventId: string, action: EventTransition, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const ev = await loadEvent(tx, eventId);
      const res = await eventResource(tx, ev.audienceIds, ev.createdByUserId);
      const settings = await settingsFor(tx, ctx.tenantId);
      let status: EventRow['status'];
      switch (action) {
        case 'submit':
          assertCan(ctx, 'events.edit', res);
          if (ev.status !== 'draft') throw new ValidationError('Only drafts can be sent for review.');
          status = 'in_review';
          break;
        case 'approve':
          if (ev.status !== 'in_review') throw new ValidationError('Only events in review can be approved.');
          if (!canApprove(ctx, 'events', res, settings)) {
            throw new AuthorizationError(
              settings.independentApproval && ev.createdByUserId === ctx.userId
                ? 'Someone else must approve an event you created.'
                : 'Not allowed: events.approve',
              'events.approve',
            );
          }
          status = 'approved';
          break;
        case 'publish':
          assertCan(ctx, 'events.publish', res);
          if (ev.status === 'published') throw new ValidationError('This event is already published.');
          if (ev.status === 'archived') throw new ValidationError('Restore the event before publishing it.');
          if (settings.requireApproval && ev.status !== 'approved') {
            throw new ValidationError('This school requires approval before publishing. Send the event for review first.');
          }
          status = 'published';
          break;
        case 'unpublish':
          assertCan(ctx, 'events.publish', res);
          if (ev.status !== 'published') throw new ValidationError('This event is not published.');
          status = 'draft';
          break;
        case 'archive':
          assertCan(ctx, 'events.archive', res);
          status = 'archived';
          break;
        case 'restore':
          assertCan(ctx, 'events.archive', res);
          if (ev.status !== 'archived') throw new ValidationError('This event is not archived.');
          status = 'draft';
          break;
      }
      const [row] = await tx
        .update(events)
        .set({ status, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: `event.${action}`,
        targetType: 'event',
        targetId: eventId,
        metadata: { from: ev.status, to: status },
      });
      return row!;
    },
    db,
  );
}

export async function deleteEvent(ctx: AuthzContext, eventId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const ev = await loadEvent(tx, eventId);
      assertCan(ctx, 'events.delete', await eventResource(tx, ev.audienceIds, ev.createdByUserId));
      await tx.delete(events).where(eq(events.id, eventId));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'event.deleted',
        targetType: 'event',
        targetId: eventId,
        metadata: { title: ev.title },
      });
    },
    db,
  );
}

export async function getEventForStaff(ctx: AuthzContext, eventId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const ev = await loadEvent(tx, eventId);
      assertCan(ctx, 'events.view', await eventResource(tx, ev.audienceIds, ev.createdByUserId));
      return ev;
    },
    db,
  );
}

export type StaffEventFilter = { calendarId?: string; status?: EventRow['status']; q?: string; limit?: number; offset?: number };

/** Staff list. Rows the user cannot view (other grades) are left out. */
export async function listEventsForStaff(ctx: AuthzContext, f: StaffEventFilter = {}, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'events.view')) throw new AuthorizationError('Not allowed: events.view', 'events.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const where = and(
        f.calendarId ? eq(events.calendarId, f.calendarId) : undefined,
        f.status ? eq(events.status, f.status) : undefined,
        f.q ? or(ilike(events.title, `%${f.q.replace(/[%_\\]/g, '\\$&')}%`), ilike(events.location, `%${f.q.replace(/[%_\\]/g, '\\$&')}%`)) : undefined,
      );
      const rows = await tx
        .select()
        .from(events)
        .where(where)
        .orderBy(desc(sql`coalesce(${events.startDate}::timestamptz, ${events.startsAt})`))
        .limit(Math.min(f.limit ?? 500, 2000))
        .offset(f.offset ?? 0);
      const audIds = [...new Set(rows.flatMap((r) => r.audienceIds))];
      const links = audIds.length
        ? await tx.select().from(audienceGrades).where(inArray(audienceGrades.audienceId, audIds))
        : [];
      const gradesOf = (ids: string[]) => [...new Set(links.filter((l) => ids.includes(l.audienceId)).map((l) => l.gradeId))];
      return rows.filter((r) =>
        can(ctx, 'events.view', { audienceIds: r.audienceIds, gradeIds: gradesOf(r.audienceIds), authorUserId: r.createdByUserId }),
      );
    },
    db,
  );
}

// ---------- Family-facing reads ----------

export type PublicOccurrence = Occurrence & {
  eventId: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string | null;
  registrationUrl: string | null;
  isImportant: boolean;
  isRecurring: boolean;
  audienceIds: string[];
  calendar: { id: string; key: string; name: string; color: string };
};

/**
 * Published events from public calendars that overlap [from, to] (local
 * dates, inclusive), expanded into occurrences and sorted by start.
 * Audience filtering: when `audienceIds` is given, keeps whole-school events
 * plus events for any of those audiences.
 */
export async function listPublicOccurrences(
  tenantId: string,
  range: { from: string; to: string },
  opts: { audienceIds?: string[]; calendarKeys?: string[] } = {},
  db: Db = platformDb(),
): Promise<PublicOccurrence[]> {
  if (!DATE.test(range.from) || !DATE.test(range.to) || range.to < range.from) throw new ValidationError('Invalid date range.');
  if (range.from < addDays(range.to, -400)) throw new ValidationError('Date range is too long.');
  return withTenant(
    tenantId,
    async (tx) => {
      const rows = await tx
        .select({ e: events, c: calendars })
        .from(events)
        .innerJoin(calendars, eq(calendars.id, events.calendarId))
        .where(
          and(
            eq(events.status, 'published'),
            eq(calendars.isPublic, true),
            opts.calendarKeys?.length ? inArray(calendars.key, opts.calendarKeys) : undefined,
            opts.audienceIds?.length
              ? or(sql`cardinality(${events.audienceIds}) = 0`, sql`${events.audienceIds} && ${sql.param(opts.audienceIds)}::uuid[]`)
              : undefined,
            // Coarse SQL pre-filter; exact overlap is decided after expansion.
            or(
              isNotNull(events.rrule),
              and(eq(events.allDay, true), sql`${events.startDate} <= ${range.to}::date`, sql`${events.endDate} >= ${range.from}::date`),
              and(
                eq(events.allDay, false),
                sql`${events.startsAt} < (${addDays(range.to, 2)}::date)::timestamptz`,
                sql`coalesce(${events.endsAt}, ${events.startsAt}) > (${addDays(range.from, -2)}::date)::timestamptz`,
              ),
            ),
          ),
        );
      const out: PublicOccurrence[] = [];
      for (const { e, c } of rows) {
        for (const o of expandOccurrences(e, range.from, range.to)) {
          out.push({
            ...o,
            eventId: e.id,
            title: e.title,
            description: e.description,
            location: e.location,
            category: e.category,
            registrationUrl: e.registrationUrl,
            isImportant: e.isImportant,
            isRecurring: !!e.rrule,
            audienceIds: e.audienceIds,
            calendar: { id: c.id, key: c.key, name: c.name, color: c.color },
          });
        }
      }
      return out.sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          Number(b.allDay) - Number(a.allDay) ||
          (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0) ||
          a.title.localeCompare(b.title),
      );
    },
    db,
  );
}

/** One published event from a public calendar (for details and Add to Calendar). */
export async function getPublicEvent(tenantId: string, eventId: string, db: Db = platformDb()) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  return withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .select({ e: events, c: calendars })
        .from(events)
        .innerJoin(calendars, eq(calendars.id, events.calendarId))
        .where(and(eq(events.id, eventId), eq(events.status, 'published'), eq(calendars.isPublic, true)));
      return row ?? null;
    },
    db,
  );
}

/** Published events of one public calendar, for its ICS subscription feed. */
export async function getPublicFeed(tenantId: string, calendarKey: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const [cal] = await tx
        .select()
        .from(calendars)
        .where(and(eq(calendars.key, calendarKey), eq(calendars.isPublic, true)));
      if (!cal) return null;
      const rows = await tx
        .select()
        .from(events)
        .where(and(eq(events.calendarId, cal.id), eq(events.status, 'published')))
        .orderBy(asc(events.startDate), asc(events.startsAt))
        .limit(5000);
      return { calendar: cal, events: rows };
    },
    db,
  );
}

// ---------- Imports ----------

const importSourceSchema = z
  .object({
    calendarId: z.uuid(),
    kind: z.enum(['ics_file', 'csv_file']),
    fileName: z.string().max(255).nullish(),
    text: z.string().max(5_000_000, 'File is too large (5 MB maximum).'),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone.'),
    csvMapping: z.record(z.string(), z.string()).optional(),
  })
  .strict();

type StoredItem = { row: number; action: PlanAction; existingId: string | null; uid: string; hash: string; event: ParsedEvent };
type StoredSummary = {
  timezone: string;
  calendarName: string | null;
  counts: ImportPlan['counts'];
  errors: ParseError[];
  items: StoredItem[];
  result?: { created: number; updated: number; cancelled: number; skipped: number };
};

function reviveEvent(e: ParsedEvent): ParsedEvent {
  return { ...e, startsAt: e.startsAt ? new Date(e.startsAt) : null, endsAt: e.endsAt ? new Date(e.endsAt) : null };
}

export type ImportPreview = {
  importId: string;
  calendarName: string | null;
  counts: ImportPlan['counts'];
  errors: ParseError[];
  items: StoredItem[];
};

/**
 * Step 1 of an import: parse the file, compare it with the calendar's
 * events, and save the preview. Nothing is created until commitImport().
 */
export async function previewImport(ctx: AuthzContext, input: unknown, db: Db = platformDb()): Promise<ImportPreview> {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'events.import')) throw new AuthorizationError('Not allowed: events.import', 'events.import');
  const parsed = importSourceSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  const src = parsed.data;
  const result =
    src.kind === 'ics_file' ? parseIcs(src.text, src.timezone) : parseCsv(src.text, (src.csvMapping ?? {}) as CsvMapping, src.timezone);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      await assertCalendarExists(tx, src.calendarId);
      const existing = await tx
        .select({
          id: events.id,
          title: events.title,
          allDay: events.allDay,
          startDate: events.startDate,
          startsAt: events.startsAt,
          timezone: events.timezone,
          externalUid: events.externalUid,
          externalHash: events.externalHash,
        })
        .from(events)
        .where(eq(events.calendarId, src.calendarId));
      // Timed events are compared by their local start date.
      const plan = planImport(
        result.events,
        existing.map((e) => ({
          ...e,
          startDate: e.startDate ?? (e.startsAt ? toDateStr(e.startsAt, e.timezone) : null),
        })),
      );
      const summary: StoredSummary = {
        timezone: src.timezone,
        calendarName: result.calendarName,
        counts: plan.counts,
        errors: result.errors,
        items: plan.items,
      };
      const [row] = await tx
        .insert(calendarImports)
        .values({
          tenantId: ctx.tenantId,
          calendarId: src.calendarId,
          sourceKind: src.kind,
          fileName: src.fileName ?? null,
          status: 'previewed',
          summary,
          createdByUserId: ctx.userId,
        })
        .returning({ id: calendarImports.id });
      return { importId: row!.id, calendarName: result.calendarName, counts: plan.counts, errors: result.errors, items: plan.items };
    },
    db,
  );
}

export async function getImportPreview(ctx: AuthzContext, importId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'events.import')) throw new AuthorizationError('Not allowed: events.import', 'events.import');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [row] = await tx.select().from(calendarImports).where(eq(calendarImports.id, importId));
      if (!row) return null;
      const s = row.summary as StoredSummary;
      return { ...row, summary: { ...s, items: s.items.map((i) => ({ ...i, event: reviveEvent(i.event) })) } };
    },
    db,
  );
}

const commitSchema = z
  .object({
    audienceIds: z.array(z.uuid()).max(50).default([]),
    publish: z.boolean().default(false),
    /** Rows flagged as possible duplicates that the admin chose to import anyway. */
    includeDuplicateRows: z.array(z.number().int()).max(5000).default([]),
  })
  .strict();

/** Step 2 of an import: applies the saved preview in one transaction. */
export async function commitImport(ctx: AuthzContext, importId: string, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  const opts = parsed.data;
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      // Lock the preview row so a double click cannot import twice.
      const [imp] = await tx.select().from(calendarImports).where(eq(calendarImports.id, importId)).for('update');
      if (!imp) throw new ValidationError('Import not found.');
      if (imp.status !== 'previewed') throw new ValidationError('This import was already completed.');
      const res = await eventResource(tx, opts.audienceIds, ctx.userId);
      assertCan(ctx, 'events.import', res);
      if (opts.publish) {
        assertCan(ctx, 'events.publish', res);
        const settings = await settingsFor(tx, ctx.tenantId);
        if (settings.requireApproval) {
          throw new ValidationError('This school requires approval before publishing. Import as drafts and send them for review.');
        }
      }
      const summary = imp.summary as StoredSummary;
      const include = new Set(opts.includeDuplicateRows);
      const status = opts.publish ? 'published' : 'draft';
      const counts = { created: 0, updated: 0, cancelled: 0, skipped: 0 };

      for (const item of summary.items) {
        const ev = reviveEvent(item.event);
        const cols = {
          title: ev.title,
          description: ev.description,
          location: ev.location,
          category: ev.category,
          allDay: ev.allDay,
          startDate: ev.allDay ? ev.startDate : null,
          endDate: ev.allDay ? ev.endDate : null,
          startsAt: ev.startsAt,
          endsAt: ev.endsAt,
          timezone: ev.timezone,
          rrule: ev.rrule,
          exdates: ev.exdates,
          registrationUrl: ev.url,
          externalHash: item.hash,
          importId: imp.id,
          updatedByUserId: ctx.userId,
          updatedAt: new Date(),
        };
        const insertNew = async (uid: string | null) => {
          await tx.insert(events).values({
            ...cols,
            tenantId: ctx.tenantId,
            calendarId: imp.calendarId,
            externalUid: uid,
            audienceIds: opts.audienceIds,
            status,
            createdByUserId: ctx.userId,
          });
          counts.created++;
        };
        if (item.action === 'new') {
          await insertNew(item.uid);
        } else if (item.action === 'update' && item.existingId) {
          // Updates keep the event's audiences and workflow status.
          await tx.update(events).set(cols).where(and(eq(events.id, item.existingId), eq(events.calendarId, imp.calendarId)));
          counts.updated++;
        } else if (item.action === 'cancel' && item.existingId) {
          await tx
            .update(events)
            .set({ status: 'archived', updatedByUserId: ctx.userId, updatedAt: new Date() })
            .where(and(eq(events.id, item.existingId), eq(events.calendarId, imp.calendarId)));
          counts.cancelled++;
        } else if (item.action === 'duplicate' && include.has(item.row)) {
          // A duplicate of a manual event: keep both, but only one can own the UID.
          const [taken] = await tx
            .select({ id: events.id })
            .from(events)
            .where(and(eq(events.calendarId, imp.calendarId), eq(events.externalUid, item.uid)));
          await insertNew(taken ? null : item.uid);
        } else {
          counts.skipped++;
        }
      }
      await tx
        .update(calendarImports)
        .set({ status: 'completed', summary: { ...summary, result: counts } })
        .where(eq(calendarImports.id, imp.id));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'calendar.imported',
        targetType: 'calendar',
        targetId: imp.calendarId,
        metadata: { importId: imp.id, ...counts, publish: opts.publish },
      });
      return counts;
    },
    db,
  );
}

export async function listImports(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'events.import')) throw new AuthorizationError('Not allowed: events.import', 'events.import');
  return withTenant(
    ctx.tenantId,
    (tx) =>
      tx
        .select({
          id: calendarImports.id,
          calendarId: calendarImports.calendarId,
          sourceKind: calendarImports.sourceKind,
          fileName: calendarImports.fileName,
          status: calendarImports.status,
          createdAt: calendarImports.createdAt,
          counts: sql<ImportPlan['counts']>`${calendarImports.summary}->'counts'`,
          result: sql<StoredSummary['result']>`${calendarImports.summary}->'result'`,
        })
        .from(calendarImports)
        .orderBy(desc(calendarImports.createdAt))
        .limit(50),
    db,
  );
}
