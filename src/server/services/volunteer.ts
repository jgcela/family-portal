// Volunteer opportunities. Same rules as announcements: permissions checked
// against audiences, RLS via withTenant(), workflow from workflow.ts, and an
// audit entry in the same transaction.
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { volunteerOpportunities, type ActionLink } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, assertCan, can, hasAnywhere, type AuthzContext } from '../rbac/authorize';
import { assertViewer, visibleTo, type Viewer } from '../viewer';
import { ValidationError } from '../errors';
import { nextStatus, type Transition } from './workflow';
import { eventResource, gradeLookup, settingsFor } from './scope';

export type VolunteerRow = typeof volunteerOpportunities.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ACTIONS = 4;

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

/** Web pages, email and phone only. Anything else (javascript:, data:) is refused. */
export function safeActionUrl(raw: string): string | null {
  const v = raw.trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v)) return v;
  if (/^tel:\+?[0-9().\- ]{3,30}$/i.test(v)) return v.replace(/\s+/g, '');
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const actionSchema = z
  .object({ label: z.string().trim().min(1, 'Each button needs a label.').max(60), url: z.string().trim().min(1).max(2048) })
  .strict()
  .transform((a, c) => {
    const url = safeActionUrl(a.url);
    if (!url) {
      c.addIssue({ code: 'custom', message: `"${a.url}" is not a web address, email (mailto:) or phone (tel:).` });
      return z.NEVER;
    }
    return { label: a.label, url } satisfies ActionLink;
  });

export const volunteerInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(200),
    category: text(60),
    organizer: text(120),
    location: text(120),
    schedule: text(120),
    commitment: text(120),
    summary: text(1000),
    body: z.string().max(20_000, 'Details are too long (20,000 characters maximum).').default(''),
    actions: z.array(actionSchema).max(MAX_ACTIONS, `Up to ${MAX_ACTIONS} buttons.`).default([]),
    visibility: z.enum(['public', 'families', 'staff']).default('families'),
    audienceIds: z.array(z.uuid()).max(50).default([]),
    sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();

function columns(input: unknown) {
  const p = volunteerInputSchema.safeParse(input);
  if (!p.success) throw new ValidationError(zodMessage(p.error));
  return { ...p.data, audienceIds: [...new Set(p.data.audienceIds)] };
}

async function load(tx: Tx, id: string): Promise<VolunteerRow> {
  if (!UUID.test(id)) throw new ValidationError('Opportunity not found.');
  const [row] = await tx.select().from(volunteerOpportunities).where(eq(volunteerOpportunities.id, id));
  if (!row) throw new ValidationError('Opportunity not found.');
  return row;
}

export async function createVolunteer(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const cols = columns(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      assertCan(ctx, 'volunteer.create', await eventResource(tx, cols.audienceIds, ctx.userId));
      const [row] = await tx
        .insert(volunteerOpportunities)
        .values({ ...cols, tenantId: ctx.tenantId, createdByUserId: ctx.userId, updatedByUserId: ctx.userId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'volunteer.created', targetType: 'volunteer', targetId: row!.id });
      return row!;
    },
    db,
  );
}

export async function updateVolunteer(ctx: AuthzContext, id: string, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const cols = columns(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      assertCan(ctx, 'volunteer.edit', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      const next = await eventResource(tx, cols.audienceIds, cur.createdByUserId);
      assertCan(ctx, 'volunteer.edit', next);
      if (cur.status === 'published') assertCan(ctx, 'volunteer.publish', next);
      const [row] = await tx
        .update(volunteerOpportunities)
        .set({ ...cols, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(volunteerOpportunities.id, id))
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'volunteer.updated', targetType: 'volunteer', targetId: id });
      return row!;
    },
    db,
  );
}

export async function transitionVolunteer(ctx: AuthzContext, id: string, action: Transition, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      const res = await eventResource(tx, cur.audienceIds, cur.createdByUserId);
      const status = nextStatus(ctx, 'volunteer', 'opportunity', cur.status, action, res, await settingsFor(tx, ctx.tenantId));
      const [row] = await tx
        .update(volunteerOpportunities)
        .set({ status, updatedByUserId: ctx.userId, updatedAt: new Date(), ...(status === 'published' ? { publishedAt: new Date() } : {}) })
        .where(eq(volunteerOpportunities.id, id))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: `volunteer.${action}`,
        targetType: 'volunteer',
        targetId: id,
        metadata: { from: cur.status, to: status },
      });
      return row!;
    },
    db,
  );
}

export async function deleteVolunteer(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      assertCan(ctx, 'volunteer.delete', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      await tx.delete(volunteerOpportunities).where(eq(volunteerOpportunities.id, id));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'volunteer.deleted',
        targetType: 'volunteer',
        targetId: id,
        metadata: { title: cur.title },
      });
    },
    db,
  );
}

export async function getVolunteerForStaff(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const row = await load(tx, id);
      assertCan(ctx, 'volunteer.view', await eventResource(tx, row.audienceIds, row.createdByUserId));
      return row;
    },
    db,
  );
}

export async function listVolunteerForStaff(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'volunteer.view')) throw new AuthorizationError('Not allowed: volunteer.view', 'volunteer.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select()
        .from(volunteerOpportunities)
        .orderBy(asc(volunteerOpportunities.sortOrder), asc(volunteerOpportunities.title))
        .limit(500);
      const gradesOf = await gradeLookup(tx, rows.flatMap((r) => r.audienceIds));
      return rows.filter((r) => can(ctx, 'volunteer.view', { audienceIds: r.audienceIds, gradeIds: gradesOf(r.audienceIds), authorUserId: r.createdByUserId }));
    },
    db,
  );
}

/** What families see: published and visible to this viewer, in the school's order. */
export async function listPublicVolunteer(tenantId: string, viewer: Viewer, opts: { limit?: number } = {}, db: Db = platformDb()) {
  assertViewer(viewer, tenantId);
  return withTenant(
    tenantId,
    (tx) =>
      tx
        .select()
        .from(volunteerOpportunities)
        .where(and(eq(volunteerOpportunities.status, 'published'), visibleTo(volunteerOpportunities, viewer)))
        .orderBy(asc(volunteerOpportunities.sortOrder), desc(volunteerOpportunities.publishedAt))
        .limit(Math.min(opts.limit ?? 100, 200)),
    db,
  );
}

/** Opportunities hidden from this viewer because they are for signed-in families (to say "sign in to see more"). */
export async function countFamilyOnlyVolunteer(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const [r] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(volunteerOpportunities)
        .where(and(eq(volunteerOpportunities.status, 'published'), eq(volunteerOpportunities.visibility, 'families')));
      return r?.n ?? 0;
    },
    db,
  );
}

// ---------- Import from a file ----------

export const volunteerImportSchema = z.object({ source: z.string().max(500).optional(), opportunities: z.array(z.unknown()).min(1).max(200) }).strict();

/**
 * Creates opportunities from a JSON file ({ "opportunities": [ … ] }, each item
 * in the same shape as the form). Items whose title already exists are skipped,
 * so loading the same file twice adds nothing. All or nothing: one invalid item
 * stops the import and names the item.
 */
export async function importVolunteer(ctx: AuthzContext, json: string, opts: { publish?: boolean } = {}, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ValidationError('The file is not valid JSON.');
  }
  const top = volunteerImportSchema.safeParse(data);
  if (!top.success) throw new ValidationError('The file must look like { "opportunities": [ … ] } with 1 to 200 items.');
  const items = top.data.opportunities.map((raw, i) => {
    const p = volunteerInputSchema.safeParse(raw);
    if (!p.success) throw new ValidationError(`Item ${i + 1}: ${zodMessage(p.error)}`);
    return { ...p.data, audienceIds: [...new Set(p.data.audienceIds)] };
  });
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const settings = await settingsFor(tx, ctx.tenantId);
      const existing = new Set(
        (await tx.select({ t: volunteerOpportunities.title }).from(volunteerOpportunities)).map((r) => r.t.trim().toLowerCase()),
      );
      let created = 0;
      let skipped = 0;
      for (const cols of items) {
        if (existing.has(cols.title.toLowerCase())) {
          skipped++;
          continue;
        }
        const res = await eventResource(tx, cols.audienceIds, ctx.userId);
        assertCan(ctx, 'volunteer.create', res);
        let status: VolunteerRow['status'] = 'draft';
        if (opts.publish) status = nextStatus(ctx, 'volunteer', 'opportunity', 'draft', 'publish', res, settings);
        await tx.insert(volunteerOpportunities).values({
          ...cols,
          tenantId: ctx.tenantId,
          status,
          publishedAt: status === 'published' ? new Date() : null,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        });
        existing.add(cols.title.toLowerCase());
        created++;
      }
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'volunteer.imported', targetType: 'volunteer', metadata: { created, skipped, publish: !!opts.publish } });
      return { created, skipped };
    },
    db,
  );
}
