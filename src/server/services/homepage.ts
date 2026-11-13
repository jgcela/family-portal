// Homepage builder: one draft and one published layout per school, plus
// archived history. Families only ever see the published layout.
import { and, desc, eq } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from '../db/client';
import { homepageVersions } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { assertCan, type AuthzContext } from '../rbac/authorize';
import { homepageSchema, validateHomepage, type HomepageBlock } from '../tenancy/homepage-defaults';
import { ValidationError } from './modules';

const HISTORY_LIMIT = 20;

function blocksOf(v: unknown): HomepageBlock[] {
  const p = homepageSchema.safeParse(v);
  return p.success ? p.data : [];
}

export async function getHomepageEditorState(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'homepage.edit');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select()
        .from(homepageVersions)
        .where(eq(homepageVersions.tenantId, ctx.tenantId))
        .orderBy(desc(homepageVersions.createdAt))
        .limit(HISTORY_LIMIT + 2);
      const draft = rows.find((r) => r.status === 'draft') ?? null;
      const published = rows.find((r) => r.status === 'published') ?? null;
      return {
        draft: draft && { id: draft.id, blocks: blocksOf(draft.blocks), createdAt: draft.createdAt },
        published: published && { id: published.id, blocks: blocksOf(published.blocks), publishedAt: published.publishedAt },
        history: rows
          .filter((r) => r.status === 'archived')
          .slice(0, HISTORY_LIMIT)
          .map((r) => ({ id: r.id, publishedAt: r.publishedAt, createdAt: r.createdAt, blockCount: blocksOf(r.blocks).length })),
      };
    },
    db,
  );
}

/** Draft layout for preview; null when there is no draft. Caller checks permission. */
export async function getHomepageDraftBlocks(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .select({ blocks: homepageVersions.blocks })
        .from(homepageVersions)
        .where(and(eq(homepageVersions.tenantId, tenantId), eq(homepageVersions.status, 'draft')));
      return row ? blocksOf(row.blocks) : null;
    },
    db,
  );
}

export async function saveHomepageDraft(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'homepage.edit');
  const v = validateHomepage(input);
  if (!v.ok) throw new ValidationError(v.errors.join(' '));
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx
        .delete(homepageVersions)
        .where(and(eq(homepageVersions.tenantId, ctx.tenantId), eq(homepageVersions.status, 'draft')));
      const [row] = await tx
        .insert(homepageVersions)
        .values({ tenantId: ctx.tenantId, status: 'draft', blocks: v.blocks, createdByUserId: ctx.userId })
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'homepage.draft_saved',
        targetType: 'homepage',
        targetId: row!.id,
      });
      return row!;
    },
    db,
  );
}

export async function discardHomepageDraft(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'homepage.edit');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const gone = await tx
        .delete(homepageVersions)
        .where(and(eq(homepageVersions.tenantId, ctx.tenantId), eq(homepageVersions.status, 'draft')))
        .returning({ id: homepageVersions.id });
      if (gone.length) {
        await audit(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: 'homepage.draft_discarded',
          targetType: 'homepage',
          targetId: gone[0]!.id,
        });
      }
    },
    db,
  );
}

export async function publishHomepageDraft(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'homepage.publish');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [draft] = await tx
        .select()
        .from(homepageVersions)
        .where(and(eq(homepageVersions.tenantId, ctx.tenantId), eq(homepageVersions.status, 'draft')))
        .for('update');
      if (!draft) throw new ValidationError('There is no draft to publish.');
      // Re-validate: rules may have tightened since the draft was saved.
      const v = validateHomepage(draft.blocks);
      if (!v.ok) throw new ValidationError(v.errors.join(' '));
      await tx
        .update(homepageVersions)
        .set({ status: 'archived' })
        .where(and(eq(homepageVersions.tenantId, ctx.tenantId), eq(homepageVersions.status, 'published')));
      const [published] = await tx
        .update(homepageVersions)
        .set({ status: 'published', publishedAt: new Date(), blocks: v.blocks })
        .where(eq(homepageVersions.id, draft.id))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'homepage.published',
        targetType: 'homepage',
        targetId: draft.id,
      });
      return published!;
    },
    db,
  );
}

/** Copies an earlier published layout into the draft. Nothing changes for families until it is published. */
export async function restoreHomepageVersion(ctx: AuthzContext, versionId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'homepage.edit');
  const [row] = await withTenant(
    ctx.tenantId,
    (tx) =>
      tx
        .select({ blocks: homepageVersions.blocks })
        .from(homepageVersions)
        .where(and(eq(homepageVersions.tenantId, ctx.tenantId), eq(homepageVersions.id, versionId))),
    db,
  );
  if (!row) throw new ValidationError('That version no longer exists.');
  return saveHomepageDraft(ctx, row.blocks, db);
}
