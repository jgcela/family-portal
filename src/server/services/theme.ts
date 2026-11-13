import { and, desc, eq } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from '../db/client';
import { themeVersions } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { assertCan, type AuthzContext } from '../rbac/authorize';
import { DEFAULT_THEME, themeTokensSchema, validateTheme, type ThemeTokens } from '../theme/tokens';
import { ValidationError } from './modules';

export async function getPublishedTheme(tenantId: string, db: Db = platformDb()): Promise<ThemeTokens> {
  return withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .select({ tokens: themeVersions.tokens })
        .from(themeVersions)
        .where(and(eq(themeVersions.tenantId, tenantId), eq(themeVersions.status, 'published')))
        .limit(1);
      const parsed = themeTokensSchema.safeParse(row?.tokens);
      return parsed.success ? parsed.data : DEFAULT_THEME;
    },
    db,
  );
}

export async function saveThemeDraft(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'branding.manage');
  const parsed = themeTokensSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx
        .delete(themeVersions)
        .where(and(eq(themeVersions.tenantId, ctx.tenantId), eq(themeVersions.status, 'draft')));
      const [row] = await tx
        .insert(themeVersions)
        .values({ tenantId: ctx.tenantId, status: 'draft', tokens: parsed.data, createdByUserId: ctx.userId })
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'theme.draft_saved',
        targetType: 'theme',
        targetId: row!.id,
      });
      return { draft: row!, issues: validateTheme(parsed.data) };
    },
    db,
  );
}

/** Publishes the current draft. Blocks publication when accessibility errors remain. */
export async function publishThemeDraft(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'branding.publish');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [draft] = await tx
        .select()
        .from(themeVersions)
        .where(and(eq(themeVersions.tenantId, ctx.tenantId), eq(themeVersions.status, 'draft')))
        .limit(1)
        .for('update');
      if (!draft) throw new ValidationError('There is no draft to publish.');
      const tokens = themeTokensSchema.parse(draft.tokens);
      const errors = validateTheme(tokens).filter((i) => i.level === 'error');
      if (errors.length) throw new ValidationError(errors.map((e) => e.message).join(' '));
      await tx
        .update(themeVersions)
        .set({ status: 'archived' })
        .where(and(eq(themeVersions.tenantId, ctx.tenantId), eq(themeVersions.status, 'published')));
      const [published] = await tx
        .update(themeVersions)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(themeVersions.id, draft.id))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'theme.published',
        targetType: 'theme',
        targetId: draft.id,
      });
      return published!;
    },
    db,
  );
}

const HISTORY_LIMIT = 20;

export async function getThemeEditorState(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'branding.manage');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select()
        .from(themeVersions)
        .where(eq(themeVersions.tenantId, ctx.tenantId))
        .orderBy(desc(themeVersions.createdAt))
        .limit(HISTORY_LIMIT + 2);
      const tokensOf = (v: unknown) => {
        const p = themeTokensSchema.safeParse(v);
        return p.success ? p.data : DEFAULT_THEME;
      };
      const draft = rows.find((r) => r.status === 'draft') ?? null;
      const published = rows.find((r) => r.status === 'published') ?? null;
      return {
        draft: draft && { id: draft.id, tokens: tokensOf(draft.tokens), createdAt: draft.createdAt },
        published: published && { id: published.id, tokens: tokensOf(published.tokens), publishedAt: published.publishedAt },
        history: rows
          .filter((r) => r.status === 'archived')
          .slice(0, HISTORY_LIMIT)
          .map((r) => ({ id: r.id, tokens: tokensOf(r.tokens), publishedAt: r.publishedAt })),
      };
    },
    db,
  );
}

/** Draft tokens for preview; null when there is no valid draft. Caller checks permission. */
export async function getThemeDraftTokens(tenantId: string, db: Db = platformDb()): Promise<ThemeTokens | null> {
  return withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .select({ tokens: themeVersions.tokens })
        .from(themeVersions)
        .where(and(eq(themeVersions.tenantId, tenantId), eq(themeVersions.status, 'draft')));
      const p = themeTokensSchema.safeParse(row?.tokens);
      return p.success ? p.data : null;
    },
    db,
  );
}

export async function discardThemeDraft(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'branding.manage');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const gone = await tx
        .delete(themeVersions)
        .where(and(eq(themeVersions.tenantId, ctx.tenantId), eq(themeVersions.status, 'draft')))
        .returning({ id: themeVersions.id });
      if (gone.length) {
        await audit(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: 'theme.draft_discarded',
          targetType: 'theme',
          targetId: gone[0]!.id,
        });
      }
    },
    db,
  );
}

/** Copies an earlier published theme into the draft. Families see no change until it is published. */
export async function restoreThemeVersion(ctx: AuthzContext, versionId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'branding.manage');
  const [row] = await withTenant(
    ctx.tenantId,
    (tx) =>
      tx
        .select({ tokens: themeVersions.tokens })
        .from(themeVersions)
        .where(and(eq(themeVersions.tenantId, ctx.tenantId), eq(themeVersions.id, versionId))),
    db,
  );
  if (!row) throw new ValidationError('That version no longer exists.');
  return saveThemeDraft(ctx, row.tokens, db);
}

export async function listThemeHistory(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    (tx) =>
      tx
        .select()
        .from(themeVersions)
        .where(eq(themeVersions.tenantId, tenantId))
        .orderBy(desc(themeVersions.createdAt)),
    db,
  );
}
