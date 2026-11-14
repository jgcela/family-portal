// School Messenger: an archive of newsletter issues (for example the weekly
// Flocknote email). Uses the announcements permissions, runs under withTenant()
// (RLS) and audits every change. HTML is sanitized before it is stored.
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { newsletterIssues } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, hasAnywhere, type AuthzContext } from '../rbac/authorize';
import type { Permission } from '../rbac/permissions';
import { assertViewer, type Viewer } from '../viewer';
import { ValidationError } from '../errors';
import { MAX_NEWSLETTER_HTML, sanitizeEmailHtml } from '../content/email-html';

export type IssueRow = typeof newsletterIssues.$inferSelect;
export type IssueSummary = Omit<IssueRow, 'html'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

export const issueInputSchema = z
  .object({
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-11-09.'),
    title: z.string().trim().min(1, 'Title is required.').max(200),
    excerpt: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((v) => v || null),
    highlights: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    html: z.string().min(1, 'The newsletter needs its HTML.').max(MAX_NEWSLETTER_HTML, 'The newsletter HTML is too large (1.5 MB maximum).'),
    visibility: z.enum(['public', 'families', 'staff']).default('public'),
    isActive: z.boolean().default(true),
  })
  .strict()
  .transform((v, c) => {
    if (Number.isNaN(Date.parse(`${v.issueDate}T00:00:00Z`))) {
      c.addIssue({ code: 'custom', path: ['issueDate'], message: 'That date does not exist.' });
      return z.NEVER;
    }
    const html = sanitizeEmailHtml(v.html);
    if (!html.trim()) {
      c.addIssue({ code: 'custom', path: ['html'], message: 'Nothing was left after cleaning the HTML.' });
      return z.NEVER;
    }
    return { ...v, html };
  });

function parse(input: unknown) {
  const p = issueInputSchema.safeParse(input);
  if (!p.success) throw new ValidationError(zodMessage(p.error));
  return p.data;
}

function need(ctx: AuthzContext, perm: Permission) {
  assertVerifiedContext(ctx);
  if (ctx.support && perm !== 'announcements.view') throw new AuthorizationError('Support sessions are read-only.');
  if (!hasAnywhere(ctx, perm)) throw new AuthorizationError(`Not allowed: ${perm}`, perm);
}

async function load(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new ValidationError('Issue not found.');
  const [row] = await tx.select().from(newsletterIssues).where(eq(newsletterIssues.id, id));
  if (!row) throw new ValidationError('Issue not found.');
  return row;
}

const summaryCols = {
  id: newsletterIssues.id,
  tenantId: newsletterIssues.tenantId,
  issueDate: newsletterIssues.issueDate,
  title: newsletterIssues.title,
  excerpt: newsletterIssues.excerpt,
  highlights: newsletterIssues.highlights,
  visibility: newsletterIssues.visibility,
  isActive: newsletterIssues.isActive,
  createdByUserId: newsletterIssues.createdByUserId,
  updatedByUserId: newsletterIssues.updatedByUserId,
  createdAt: newsletterIssues.createdAt,
  updatedAt: newsletterIssues.updatedAt,
};

/**
 * Adds an issue, or replaces the one with the same date (re-importing an
 * archive updates it instead of duplicating). Returns whether it was new.
 */
export async function saveIssue(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  need(ctx, 'announcements.create');
  const cols = parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [cur] = await tx.select({ id: newsletterIssues.id }).from(newsletterIssues).where(eq(newsletterIssues.issueDate, cols.issueDate));
      if (cur) {
        need(ctx, 'announcements.edit');
        const [row] = await tx
          .update(newsletterIssues)
          .set({ ...cols, updatedByUserId: ctx.userId, updatedAt: new Date() })
          .where(eq(newsletterIssues.id, cur.id))
          .returning({ id: newsletterIssues.id });
        await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'newsletter.updated', targetType: 'newsletter', targetId: cur.id, metadata: { date: cols.issueDate } });
        return { id: row!.id, created: false };
      }
      const [row] = await tx
        .insert(newsletterIssues)
        .values({ ...cols, tenantId: ctx.tenantId, createdByUserId: ctx.userId, updatedByUserId: ctx.userId })
        .returning({ id: newsletterIssues.id });
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'newsletter.created', targetType: 'newsletter', targetId: row!.id, metadata: { date: cols.issueDate } });
      return { id: row!.id, created: true };
    },
    db,
  );
}

/** Changes the details of an issue (not its HTML). */
export async function updateIssueDetails(
  ctx: AuthzContext,
  id: string,
  input: { title: string; excerpt?: string | null; highlights?: string[]; visibility?: string; isActive?: boolean },
  db: Db = platformDb(),
) {
  need(ctx, 'announcements.edit');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      const cols = parse({ ...input, issueDate: cur.issueDate, html: cur.html });
      const [row] = await tx
        .update(newsletterIssues)
        .set({ title: cols.title, excerpt: cols.excerpt, highlights: cols.highlights, visibility: cols.visibility, isActive: cols.isActive, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(newsletterIssues.id, id))
        .returning(summaryCols);
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'newsletter.updated', targetType: 'newsletter', targetId: id });
      return row!;
    },
    db,
  );
}

export async function deleteIssue(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  need(ctx, 'announcements.delete');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      await tx.delete(newsletterIssues).where(eq(newsletterIssues.id, id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'newsletter.deleted', targetType: 'newsletter', targetId: id, metadata: { date: cur.issueDate, title: cur.title } });
    },
    db,
  );
}

export async function getIssueForStaff(ctx: AuthzContext, id: string, db: Db = platformDb()): Promise<IssueSummary> {
  need(ctx, 'announcements.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const { html: _html, ...rest } = await load(tx, id);
      return rest;
    },
    db,
  );
}

export async function listIssuesForStaff(ctx: AuthzContext, db: Db = platformDb()): Promise<IssueSummary[]> {
  need(ctx, 'announcements.view');
  return withTenant(ctx.tenantId, (tx) => tx.select(summaryCols).from(newsletterIssues).orderBy(desc(newsletterIssues.issueDate)).limit(1000), db);
}

/** Issues are for everyone, signed-in families, or staff only. */
function seenBy(v: Viewer) {
  if (v.kind === 'staff') return undefined;
  return inArray(newsletterIssues.visibility, v.kind === 'family' ? ['public', 'families'] : ['public']);
}

/** The archive list this viewer may see, newest first (without the HTML). */
export async function listPublicIssues(tenantId: string, viewer: Viewer, opts: { limit?: number } = {}, db: Db = platformDb()): Promise<IssueSummary[]> {
  assertViewer(viewer, tenantId);
  return withTenant(
    tenantId,
    (tx) =>
      tx
        .select(summaryCols)
        .from(newsletterIssues)
        .where(and(eq(newsletterIssues.isActive, true), seenBy(viewer)))
        .orderBy(desc(newsletterIssues.issueDate))
        .limit(Math.min(opts.limit ?? 500, 1000)),
    db,
  );
}

/** One issue with its HTML, or null when it does not exist or this viewer may not see it. */
export async function getPublicIssue(tenantId: string, id: string, viewer: Viewer, db: Db = platformDb()): Promise<IssueRow | null> {
  assertViewer(viewer, tenantId);
  if (!UUID.test(id)) return null;
  return withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .select()
        .from(newsletterIssues)
        .where(and(eq(newsletterIssues.id, id), eq(newsletterIssues.isActive, true), seenBy(viewer)));
      return row ?? null;
    },
    db,
  );
}
