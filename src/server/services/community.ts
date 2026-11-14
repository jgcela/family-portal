// Community: teacher wishlists and staff "favorite things".
// Simple records without a draft workflow: "Show it" turns one on or off.
// Writes need community.edit (create/delete need community.create/delete),
// run under withTenant() (RLS) and are audited in the same transaction.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { communityItems, type DetailLine } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, hasAnywhere, type AuthzContext } from '../rbac/authorize';
import { assertViewer, type Viewer } from '../viewer';
import { ValidationError } from '../errors';
import type { Permission } from '../rbac/permissions';

export type CommunityRow = typeof communityItems.$inferSelect;
export const COMMUNITY_KINDS = {
  wishlist: { label: 'Teacher wishlists', noun: 'wishlist', defaultVisibility: 'public' as const },
  favorites: { label: 'Staff favorites', noun: 'staff card', defaultVisibility: 'families' as const },
} as const;
export type CommunityKind = keyof typeof COMMUNITY_KINDS;
export const MAX_DETAILS = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const detail = z
  .object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(300) })
  .strict()
  .transform((d) => d satisfies DetailLine);

export const communityInputSchema = z
  .object({
    kind: z.enum(['wishlist', 'favorites']),
    groupName: opt(60),
    name: z.string().trim().min(1, 'Name is required.').max(120),
    role: opt(160),
    url: opt(2048),
    details: z.array(detail).max(MAX_DETAILS, `Up to ${MAX_DETAILS} lines.`).default([]),
    visibility: z.enum(['public', 'families', 'staff']).optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict()
  .transform((v, c) => {
    let url: string | null = null;
    if (v.url) {
      try {
        const u = new URL(v.url);
        if (u.protocol === 'https:') url = u.toString();
      } catch {
        /* handled below */
      }
      if (!url) {
        c.addIssue({ code: 'custom', path: ['url'], message: `"${v.url}" is not a secure web address (https://…).` });
        return z.NEVER;
      }
    }
    if (v.kind === 'wishlist' && !url) {
      c.addIssue({ code: 'custom', path: ['url'], message: 'A wishlist needs its link.' });
      return z.NEVER;
    }
    return {
      ...v,
      url,
      // Empty lines are dropped so the card only shows what the person shared.
      details: v.details.filter((d) => d.value),
      visibility: v.visibility ?? COMMUNITY_KINDS[v.kind].defaultVisibility,
    };
  });

function parse(input: unknown) {
  const p = communityInputSchema.safeParse(input);
  if (!p.success) throw new ValidationError(zodMessage(p.error));
  return p.data;
}

function need(ctx: AuthzContext, perm: Permission) {
  assertVerifiedContext(ctx);
  if (ctx.support && perm !== 'community.view') throw new AuthorizationError('Support sessions are read-only.');
  if (!hasAnywhere(ctx, perm)) throw new AuthorizationError(`Not allowed: ${perm}`, perm);
}

async function load(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new ValidationError('Item not found.');
  const [row] = await tx.select().from(communityItems).where(eq(communityItems.id, id));
  if (!row) throw new ValidationError('Item not found.');
  return row;
}

export async function createCommunityItem(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  need(ctx, 'community.create');
  const cols = parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [row] = await tx
        .insert(communityItems)
        .values({ ...cols, tenantId: ctx.tenantId, createdByUserId: ctx.userId, updatedByUserId: ctx.userId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'community.created', targetType: 'community', targetId: row!.id, metadata: { kind: cols.kind } });
      return row!;
    },
    db,
  );
}

export async function updateCommunityItem(ctx: AuthzContext, id: string, input: unknown, db: Db = platformDb()) {
  need(ctx, 'community.edit');
  const cols = parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      if (cur.kind !== cols.kind) throw new ValidationError('An item cannot change kind.');
      const [row] = await tx
        .update(communityItems)
        .set({ ...cols, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(communityItems.id, id))
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'community.updated', targetType: 'community', targetId: id, metadata: { kind: cols.kind } });
      return row!;
    },
    db,
  );
}

export async function deleteCommunityItem(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  need(ctx, 'community.delete');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      await tx.delete(communityItems).where(eq(communityItems.id, id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'community.deleted', targetType: 'community', targetId: id, metadata: { kind: cur.kind, name: cur.name } });
    },
    db,
  );
}

export async function getCommunityItemForStaff(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  need(ctx, 'community.view');
  return withTenant(ctx.tenantId, (tx) => load(tx, id), db);
}

export async function listCommunityForStaff(ctx: AuthzContext, kind: CommunityKind, db: Db = platformDb()) {
  need(ctx, 'community.view');
  return withTenant(
    ctx.tenantId,
    (tx) =>
      tx
        .select()
        .from(communityItems)
        .where(eq(communityItems.kind, kind))
        .orderBy(asc(communityItems.sortOrder), asc(communityItems.name))
        .limit(500),
    db,
  );
}

/** Items are for everyone, signed-in families, or staff only (no per-grade audiences). */
function seenBy(v: Viewer) {
  if (v.kind === 'staff') return undefined;
  return inArray(communityItems.visibility, v.kind === 'family' ? ['public', 'families'] : ['public']);
}

/** What this viewer may see of one kind, in the school's order. */
export async function listPublicCommunity(tenantId: string, kind: CommunityKind, viewer: Viewer, db: Db = platformDb()) {
  assertViewer(viewer, tenantId);
  return withTenant(
    tenantId,
    (tx) =>
      tx
        .select()
        .from(communityItems)
        .where(and(eq(communityItems.kind, kind), eq(communityItems.isActive, true), seenBy(viewer)))
        .orderBy(asc(communityItems.sortOrder), asc(communityItems.name))
        .limit(500),
    db,
  );
}

/** How many shown items of this kind are for signed-in families only (for "sign in to see more"). */
export async function countFamilyOnlyCommunity(tenantId: string, kind: CommunityKind, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const [r] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(communityItems)
        .where(and(eq(communityItems.kind, kind), eq(communityItems.isActive, true), eq(communityItems.visibility, 'families')));
      return r?.n ?? 0;
    },
    db,
  );
}

// ---------- Import from a file ----------

const importSchema = z.object({ source: z.string().max(500).optional(), items: z.array(z.unknown()).min(1).max(300) }).strict();

/**
 * Creates items from a JSON file ({ "items": [ … ] }, each in the same shape as
 * the form, with "kind"). An item whose kind, name and role already exist is skipped,
 * so the same file can be loaded twice. All or nothing.
 */
export async function importCommunity(ctx: AuthzContext, json: string, db: Db = platformDb()) {
  need(ctx, 'community.create');
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ValidationError('The file is not valid JSON.');
  }
  const top = importSchema.safeParse(data);
  if (!top.success) throw new ValidationError('The file must look like { "items": [ … ] } with 1 to 300 items.');
  const items = top.data.items.map((raw, i) => {
    const p = communityInputSchema.safeParse(raw);
    if (!p.success) throw new ValidationError(`Item ${i + 1}: ${zodMessage(p.error)}`);
    return p.data;
  });
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      // Two people can share a name ("Mrs. Smith" in two departments), so the role is part of the key.
      const keyOf = (kind: string, name: string, role: string | null) => [kind, name.trim().toLowerCase(), (role ?? '').trim().toLowerCase()].join('\n');
      const existing = new Set(
        (await tx.select({ k: communityItems.kind, n: communityItems.name, r: communityItems.role }).from(communityItems)).map((r) => keyOf(r.k, r.n, r.r)),
      );
      let created = 0;
      let skipped = 0;
      for (const cols of items) {
        const k = keyOf(cols.kind, cols.name, cols.role);
        if (existing.has(k)) {
          skipped++;
          continue;
        }
        await tx.insert(communityItems).values({ ...cols, tenantId: ctx.tenantId, createdByUserId: ctx.userId, updatedByUserId: ctx.userId });
        existing.add(k);
        created++;
      }
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'community.imported', targetType: 'community', metadata: { created, skipped } });
      return { created, skipped };
    },
    db,
  );
}
