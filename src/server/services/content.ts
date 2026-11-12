// Announcements and School Pages. Same rules as events: permissions checked
// against audiences, RLS via withTenant(), audit entry in the same transaction.
import { and, asc, desc, eq, gt, isNull, lte, max, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { announcements, pages, pageVersions } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, assertCan, can, hasAnywhere, type AuthzContext } from '../rbac/authorize';
import { ValidationError } from './modules';
import { nextStatus, type Transition } from './workflow';
import { eventResource, gradeLookup, settingsFor } from './scope';

type AnnouncementRow = typeof announcements.$inferSelect;
type PageRow = typeof pages.$inferSelect;

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalDate = z
  .union([z.iso.datetime({ offset: true }), z.date(), z.literal('')])
  .nullish()
  .transform((v) => (v ? new Date(v) : null));

// ---------- Announcements ----------

export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(200),
    summary: z.string().trim().max(300).nullish(),
    body: z.string().max(50_000, 'Text is too long (50,000 characters maximum).').default(''),
    isUrgent: z.boolean().default(false),
    isPinned: z.boolean().default(false),
    audienceIds: z.array(z.uuid()).max(50).default([]),
    publishAt: optionalDate,
    expiresAt: optionalDate,
  })
  .strict();

function announcementColumns(input: unknown) {
  const parsed = announcementInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  const d = parsed.data;
  if (d.publishAt && d.expiresAt && d.expiresAt <= d.publishAt) throw new ValidationError('The end date must be after the start date.');
  return { ...d, summary: d.summary || null, audienceIds: [...new Set(d.audienceIds)] };
}

async function loadAnnouncement(tx: Tx, id: string): Promise<AnnouncementRow> {
  if (!UUID.test(id)) throw new ValidationError('Announcement not found.');
  const [row] = await tx.select().from(announcements).where(eq(announcements.id, id));
  if (!row) throw new ValidationError('Announcement not found.');
  return row;
}

export async function createAnnouncement(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const cols = announcementColumns(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      assertCan(ctx, 'announcements.create', await eventResource(tx, cols.audienceIds, ctx.userId));
      const [row] = await tx
        .insert(announcements)
        .values({ ...cols, tenantId: ctx.tenantId, createdByUserId: ctx.userId, updatedByUserId: ctx.userId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'announcement.created', targetType: 'announcement', targetId: row!.id });
      return row!;
    },
    db,
  );
}

export async function updateAnnouncement(ctx: AuthzContext, id: string, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const cols = announcementColumns(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await loadAnnouncement(tx, id);
      assertCan(ctx, 'announcements.edit', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      const next = await eventResource(tx, cols.audienceIds, cur.createdByUserId);
      assertCan(ctx, 'announcements.edit', next);
      if (cur.status === 'published') assertCan(ctx, 'announcements.publish', next);
      const [row] = await tx
        .update(announcements)
        .set({ ...cols, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(announcements.id, id))
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'announcement.updated', targetType: 'announcement', targetId: id });
      return row!;
    },
    db,
  );
}

export async function transitionAnnouncement(ctx: AuthzContext, id: string, action: Transition, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await loadAnnouncement(tx, id);
      const res = await eventResource(tx, cur.audienceIds, cur.createdByUserId);
      const status = nextStatus(ctx, 'announcements', 'announcement', cur.status, action, res, await settingsFor(tx, ctx.tenantId));
      const [row] = await tx
        .update(announcements)
        .set({
          status,
          updatedByUserId: ctx.userId,
          updatedAt: new Date(),
          ...(status === 'published' ? { publishedAt: new Date() } : {}),
        })
        .where(eq(announcements.id, id))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: `announcement.${action}`,
        targetType: 'announcement',
        targetId: id,
        metadata: { from: cur.status, to: status },
      });
      return row!;
    },
    db,
  );
}

export async function deleteAnnouncement(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await loadAnnouncement(tx, id);
      assertCan(ctx, 'announcements.delete', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      await tx.delete(announcements).where(eq(announcements.id, id));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'announcement.deleted',
        targetType: 'announcement',
        targetId: id,
        metadata: { title: cur.title },
      });
    },
    db,
  );
}

export async function getAnnouncementForStaff(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const row = await loadAnnouncement(tx, id);
      assertCan(ctx, 'announcements.view', await eventResource(tx, row.audienceIds, row.createdByUserId));
      return row;
    },
    db,
  );
}

export async function listAnnouncementsForStaff(
  ctx: AuthzContext,
  f: { status?: AnnouncementRow['status']; q?: string } = {},
  db: Db = platformDb(),
) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'announcements.view')) throw new AuthorizationError('Not allowed: announcements.view', 'announcements.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select()
        .from(announcements)
        .where(
          and(
            f.status ? eq(announcements.status, f.status) : undefined,
            f.q ? sql`${announcements.title} ilike ${`%${f.q.replace(/[%_\\]/g, '\\$&')}%`}` : undefined,
          ),
        )
        .orderBy(desc(announcements.updatedAt))
        .limit(500);
      const gradesOf = await gradeLookup(tx, rows.flatMap((r) => r.audienceIds));
      return rows.filter((r) =>
        can(ctx, 'announcements.view', { audienceIds: r.audienceIds, gradeIds: gradesOf(r.audienceIds), authorUserId: r.createdByUserId }),
      );
    },
    db,
  );
}

/** What families see: published, started, not expired; urgent and pinned first. */
export async function listPublicAnnouncements(
  tenantId: string,
  opts: { audienceIds?: string[]; limit?: number; now?: Date } = {},
  db: Db = platformDb(),
) {
  const now = opts.now ?? new Date();
  return withTenant(
    tenantId,
    (tx) =>
      tx
        .select()
        .from(announcements)
        .where(
          and(
            eq(announcements.status, 'published'),
            or(isNull(announcements.publishAt), lte(announcements.publishAt, now)),
            or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
            opts.audienceIds?.length
              ? or(
                  sql`cardinality(${announcements.audienceIds}) = 0`,
                  sql`${announcements.audienceIds} && ${sql.param(opts.audienceIds)}::uuid[]`,
                )
              : undefined,
          ),
        )
        .orderBy(
          desc(announcements.isUrgent),
          desc(announcements.isPinned),
          desc(sql`coalesce(${announcements.publishAt}, ${announcements.publishedAt})`),
        )
        .limit(Math.min(opts.limit ?? 50, 200)),
    db,
  );
}

export async function getPublicAnnouncement(tenantId: string, id: string, now = new Date(), db: Db = platformDb()) {
  if (!UUID.test(id)) return null;
  return withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .select()
        .from(announcements)
        .where(
          and(
            eq(announcements.id, id),
            eq(announcements.status, 'published'),
            or(isNull(announcements.publishAt), lte(announcements.publishAt, now)),
            or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
          ),
        );
      return row ?? null;
    },
    db,
  );
}

// ---------- Pages ----------

const RESERVED_SLUGS = new Set(['admin', 'login', 'calendar', 'updates', 'p', 'api', 'feed', 'search', 'documents', 'resources', 'messenger']);

export const pageInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{0,59}$/, 'Web address: lowercase letters, numbers and hyphens (max 60).')
      .refine((s) => !RESERVED_SLUGS.has(s), 'That web address is reserved. Choose another.'),
    title: z.string().trim().min(1, 'Title is required.').max(200),
    body: z.string().max(400_000, 'Page is too long (400,000 characters maximum).').default(''),
    showToc: z.boolean().default(false),
    audienceIds: z.array(z.uuid()).max(50).default([]),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

function pageColumns(input: unknown) {
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodMessage(parsed.error));
  return { ...parsed.data, audienceIds: [...new Set(parsed.data.audienceIds)] };
}

async function loadPage(tx: Tx, id: string): Promise<PageRow> {
  if (!UUID.test(id)) throw new ValidationError('Page not found.');
  const [row] = await tx.select().from(pages).where(eq(pages.id, id));
  if (!row) throw new ValidationError('Page not found.');
  return row;
}

async function assertSlugFree(tx: Tx, slug: string, exceptId?: string) {
  const [hit] = await tx.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug));
  if (hit && hit.id !== exceptId) throw new ValidationError(`Another page already uses the address "${slug}".`);
}

export async function createPage(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const cols = pageColumns(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      assertCan(ctx, 'pages.create', await eventResource(tx, cols.audienceIds, ctx.userId));
      await assertSlugFree(tx, cols.slug);
      const [row] = await tx
        .insert(pages)
        .values({ ...cols, tenantId: ctx.tenantId, createdByUserId: ctx.userId, updatedByUserId: ctx.userId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'page.created', targetType: 'page', targetId: row!.id });
      return row!;
    },
    db,
  );
}

/**
 * Edits the working copy. Families keep seeing the last published version
 * until the page is published again, so editing a live page is safe; a page
 * with unpublished changes goes back to draft (or review) status.
 */
export async function updatePage(ctx: AuthzContext, id: string, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const cols = pageColumns(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await loadPage(tx, id);
      assertCan(ctx, 'pages.edit', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      const next = await eventResource(tx, cols.audienceIds, cur.createdByUserId);
      assertCan(ctx, 'pages.edit', next);
      // Address and audience changes take effect immediately, so they need publish rights on a live page.
      if (cur.publishedVersionId && (cols.slug !== cur.slug || cols.audienceIds.join() !== cur.audienceIds.join())) {
        assertCan(ctx, 'pages.publish', next);
      }
      await assertSlugFree(tx, cols.slug, id);
      const status = cur.status === 'published' || cur.status === 'approved' ? 'draft' : cur.status;
      const [row] = await tx
        .update(pages)
        .set({ ...cols, status, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(pages.id, id))
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'page.updated', targetType: 'page', targetId: id });
      return row!;
    },
    db,
  );
}

export async function transitionPage(ctx: AuthzContext, id: string, action: Transition, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await loadPage(tx, id);
      const res = await eventResource(tx, cur.audienceIds, cur.createdByUserId);
      let status: PageRow['status'];
      if (action === 'unpublish') {
        // A page can be live (publishedVersionId) while its working copy is a draft.
        assertCan(ctx, 'pages.publish', res);
        if (!cur.publishedVersionId) throw new ValidationError('This page is not published.');
        status = cur.status === 'published' ? 'draft' : cur.status;
      } else {
        status = nextStatus(ctx, 'pages', 'page', cur.status, action, res, await settingsFor(tx, ctx.tenantId));
      }
      let publishedVersionId = cur.publishedVersionId;
      if (action === 'publish') {
        const [{ v }] = (await tx.select({ v: max(pageVersions.version) }).from(pageVersions).where(eq(pageVersions.pageId, id))) as [
          { v: number | null },
        ];
        const [ver] = await tx
          .insert(pageVersions)
          .values({
            tenantId: ctx.tenantId,
            pageId: id,
            version: (v ?? 0) + 1,
            title: cur.title,
            body: cur.body,
            showToc: cur.showToc,
            publishedByUserId: ctx.userId,
          })
          .returning({ id: pageVersions.id });
        publishedVersionId = ver!.id;
      }
      if (action === 'unpublish' || action === 'archive') publishedVersionId = null;
      const [row] = await tx
        .update(pages)
        .set({ status, publishedVersionId, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(pages.id, id))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: `page.${action}`,
        targetType: 'page',
        targetId: id,
        metadata: { from: cur.status, to: status },
      });
      return row!;
    },
    db,
  );
}

/** Puts an older published version back into the working copy (as a draft). */
export async function restorePageVersion(ctx: AuthzContext, pageId: string, versionId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await loadPage(tx, pageId);
      assertCan(ctx, 'pages.edit', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      if (!UUID.test(versionId)) throw new ValidationError('Version not found.');
      const [ver] = await tx
        .select()
        .from(pageVersions)
        .where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)));
      if (!ver) throw new ValidationError('Version not found.');
      const [row] = await tx
        .update(pages)
        .set({ title: ver.title, body: ver.body, showToc: ver.showToc, status: 'draft', updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(pages.id, pageId))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'page.version_restored',
        targetType: 'page',
        targetId: pageId,
        metadata: { version: ver.version },
      });
      return row!;
    },
    db,
  );
}

export async function deletePage(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await loadPage(tx, id);
      assertCan(ctx, 'pages.delete', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      await tx.delete(pages).where(eq(pages.id, id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'page.deleted', targetType: 'page', targetId: id, metadata: { slug: cur.slug } });
    },
    db,
  );
}

export async function getPageForStaff(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const page = await loadPage(tx, id);
      assertCan(ctx, 'pages.view', await eventResource(tx, page.audienceIds, page.createdByUserId));
      const versions = await tx
        .select({ id: pageVersions.id, version: pageVersions.version, title: pageVersions.title, createdAt: pageVersions.createdAt })
        .from(pageVersions)
        .where(eq(pageVersions.pageId, id))
        .orderBy(desc(pageVersions.version))
        .limit(50);
      return { page, versions };
    },
    db,
  );
}

export async function listPagesForStaff(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'pages.view')) throw new AuthorizationError('Not allowed: pages.view', 'pages.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx.select().from(pages).orderBy(asc(pages.sortOrder), asc(pages.title));
      const gradesOf = await gradeLookup(tx, rows.flatMap((r) => r.audienceIds));
      return rows.filter((r) =>
        can(ctx, 'pages.view', { audienceIds: r.audienceIds, gradeIds: gradesOf(r.audienceIds), authorUserId: r.createdByUserId }),
      );
    },
    db,
  );
}

/** The published snapshot of a page, by address. Drafts are never returned. */
export async function getPublishedPage(tenantId: string, slug: string, db: Db = platformDb()) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return null;
  return withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .select({ page: pages, version: pageVersions })
        .from(pages)
        .innerJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
        .where(eq(pages.slug, slug));
      return row ?? null;
    },
    db,
  );
}

export async function listPublishedPages(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    (tx) =>
      tx
        .select({ slug: pages.slug, title: pageVersions.title, audienceIds: pages.audienceIds })
        .from(pages)
        .innerJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
        .orderBy(asc(pages.sortOrder), asc(pageVersions.title)),
    db,
  );
}
