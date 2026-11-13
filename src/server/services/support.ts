// Platform support access to a school's dashboard.
//
// There is no standing access: a platform user asks, the School Owner approves,
// and the access is read-only, limited to chosen areas, ends at a fixed time
// and can be revoked at any moment. Every request, decision and first use is
// in the school's activity log.
import { and, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { auditLogs, supportGrants, tenants, user } from '../db/schema';
import { audit } from '../audit/log';
import { AuthorizationError, can, type AuthzContext, type Grant } from '../rbac/authorize';
import { assertVerifiedContext } from '../rbac/context';
import { PERMISSIONS } from '../rbac/permissions';
import { ValidationError } from './modules';
import { assertPlatformContext, type PlatformContext } from './platform';

export const SUPPORT_SCOPES = {
  content: {
    label: 'Content and settings',
    description: 'Announcements, calendar, pages, documents, theme, homepage, modules and the activity log.',
  },
  people: {
    label: 'People',
    description: 'Names and emails of staff and families, and roles.',
  },
} as const;
export type SupportScope = keyof typeof SUPPORT_SCOPES;

export const SUPPORT_HOURS = [2, 8, 24, 72] as const;

const PEOPLE_PERMS = new Set(['users.view', 'roles.view']);

/** Read-only permissions a grant gives. Never anything that changes data. */
export function supportPermissions(scopes: readonly string[]): string[] {
  const views = PERMISSIONS.filter((p) => p.key.endsWith('.view')).map((p) => p.key);
  const out = new Set<string>(['dashboard.view']);
  if (scopes.includes('content')) for (const k of views) if (!PEOPLE_PERMS.has(k)) out.add(k);
  if (scopes.includes('people')) for (const k of PEOPLE_PERMS) out.add(k);
  return [...out];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SupportGrantState = 'pending' | 'active' | 'declined' | 'revoked' | 'expired';

export function grantState(g: { approvedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): SupportGrantState {
  if (g.revokedAt) return g.approvedAt ? 'revoked' : 'declined';
  if (g.expiresAt <= now) return 'expired';
  return g.approvedAt ? 'active' : 'pending';
}

// ---------- Platform side ----------

const requestSchema = z
  .object({
    reason: z.string().trim().min(10, 'Explain what you need to look at (at least 10 characters).').max(500),
    scopes: z.array(z.enum(['content', 'people'])).min(1, 'Choose at least one area.'),
    hours: z.coerce.number().refine((h) => (SUPPORT_HOURS as readonly number[]).includes(h), 'Choose how long you need.'),
  })
  .strict();

/** A platform user asks a school for temporary read-only access. */
export async function requestSupportAccess(pctx: PlatformContext, tenantId: string, input: unknown, db: Db = platformDb()) {
  assertPlatformContext(pctx);
  if (!UUID.test(tenantId)) throw new ValidationError('School not found.');
  const p = requestSchema.safeParse(input);
  if (!p.success) throw new ValidationError(p.error.issues.map((i) => i.message).join(' '));
  const v = p.data;
  const [t] = await db.select({ id: tenants.id, status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId));
  if (!t) throw new ValidationError('School not found.');
  if (t.status !== 'active' && t.status !== 'onboarding') throw new ValidationError('The school’s dashboard is closed while it is suspended.');
  return db.transaction(async (tx) => {
    const open = await tx
      .select({ id: supportGrants.id })
      .from(supportGrants)
      .where(and(eq(supportGrants.tenantId, tenantId), eq(supportGrants.platformUserId, pctx.userId), isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, new Date())));
    if (open.length) throw new ValidationError('You already have an open request or access for this school.');
    const [g] = await tx
      .insert(supportGrants)
      .values({ tenantId, platformUserId: pctx.userId, scopes: [...new Set(v.scopes)], reason: v.reason, expiresAt: new Date(Date.now() + v.hours * 3600_000) })
      .returning();
    await audit(tx, {
      tenantId,
      actorUserId: pctx.userId,
      actorKind: 'platform',
      action: 'support.requested',
      targetType: 'support_grant',
      targetId: g!.id,
      metadata: { scopes: g!.scopes, hours: v.hours },
    });
    return g!;
  });
}

/** The platform user's own requests for one school, newest first. */
export async function listMySupportGrants(pctx: PlatformContext, tenantId: string, db: Db = platformDb()) {
  assertPlatformContext(pctx);
  if (!UUID.test(tenantId)) return [];
  const rows = await db
    .select()
    .from(supportGrants)
    .where(and(eq(supportGrants.tenantId, tenantId), eq(supportGrants.platformUserId, pctx.userId)))
    .orderBy(desc(supportGrants.requestedAt))
    .limit(20);
  return rows.map((g) => ({ ...g, state: grantState(g) }));
}

/** The platform user ends their own access early. */
export async function endMySupportAccess(pctx: PlatformContext, grantId: string, db: Db = platformDb()) {
  assertPlatformContext(pctx);
  if (!UUID.test(grantId)) throw new ValidationError('Request not found.');
  await db.transaction(async (tx) => {
    const [g] = await tx
      .update(supportGrants)
      .set({ revokedAt: new Date() })
      .where(and(eq(supportGrants.id, grantId), eq(supportGrants.platformUserId, pctx.userId), isNull(supportGrants.revokedAt)))
      .returning();
    if (!g) throw new ValidationError('Request not found or already closed.');
    await audit(tx, { tenantId: g.tenantId, actorUserId: pctx.userId, actorKind: 'platform', action: 'support.ended', targetType: 'support_grant', targetId: g.id });
  });
}

// ---------- School side ----------

function assertCanGrant(ctx: AuthzContext) {
  assertVerifiedContext(ctx);
  if (ctx.support) throw new AuthorizationError('Support sessions cannot manage support access.');
  if (!can(ctx, 'support.grant')) throw new AuthorizationError('Only the School Owner can manage support access.', 'support.grant');
}

/** Requests and grants for the school, with who asked. */
export async function listSupportGrants(ctx: AuthzContext, db: Db = platformDb()) {
  assertCanGrant(ctx);
  const rows = await withTenant(ctx.tenantId, (tx) => tx.select().from(supportGrants).orderBy(desc(supportGrants.requestedAt)).limit(50), db);
  // The school may know who at the platform asked for access; nothing else about them.
  const ids = [...new Set(rows.map((r) => r.platformUserId))];
  const people = ids.length ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, ids)) : [];
  return rows.map((g) => ({ ...g, state: grantState(g), requester: people.find((p) => p.id === g.platformUserId) ?? null }));
}

async function decide(ctx: AuthzContext, grantId: string, decision: 'approve' | 'decline' | 'revoke', db: Db) {
  assertCanGrant(ctx);
  if (!UUID.test(grantId)) throw new ValidationError('Request not found.');
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      const [g] = await tx.select().from(supportGrants).where(eq(supportGrants.id, grantId)).for('update');
      if (!g) throw new ValidationError('Request not found.');
      const state = grantState(g);
      const now = new Date();
      if (decision === 'revoke') {
        if (state !== 'active') throw new ValidationError('This access is not active.');
        await tx.update(supportGrants).set({ revokedAt: now }).where(eq(supportGrants.id, grantId));
      } else {
        if (state !== 'pending') throw new ValidationError(state === 'expired' ? 'This request has expired.' : 'This request was already answered.');
        if (decision === 'approve') await tx.update(supportGrants).set({ approvedAt: now, approvedByUserId: ctx.userId }).where(eq(supportGrants.id, grantId));
        else await tx.update(supportGrants).set({ revokedAt: now }).where(eq(supportGrants.id, grantId));
      }
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: decision === 'approve' ? 'support.approved' : decision === 'decline' ? 'support.declined' : 'support.revoked',
        targetType: 'support_grant',
        targetId: grantId,
      });
    },
    db,
  );
}

export const approveSupportGrant = (ctx: AuthzContext, id: string, db: Db = platformDb()) => decide(ctx, id, 'approve', db);
export const declineSupportGrant = (ctx: AuthzContext, id: string, db: Db = platformDb()) => decide(ctx, id, 'decline', db);
export const revokeSupportGrant = (ctx: AuthzContext, id: string, db: Db = platformDb()) => decide(ctx, id, 'revoke', db);

export async function countPendingSupportRequests(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const rows = await tx.select({ id: supportGrants.id }).from(supportGrants).where(and(isNull(supportGrants.approvedAt), isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, new Date())));
      return rows.length;
    },
    db,
  );
}

// ---------- Support session context ----------

/**
 * For a user with no membership in the school: the read-only grants of an
 * approved, unexpired, unrevoked support grant, or null. Called from
 * loadAuthzContext inside the school's RLS transaction.
 */
export async function activeSupportGrants(tx: Tx, tenantId: string, userId: string) {
  const [g] = await tx
    .select()
    .from(supportGrants)
    .where(and(eq(supportGrants.platformUserId, userId), isNotNull(supportGrants.approvedAt), isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, new Date())))
    .orderBy(desc(supportGrants.expiresAt))
    .limit(1);
  if (!g) return null;
  const grants: Grant[] = supportPermissions(g.scopes).map((permission) => Object.freeze({ permission, scopeType: 'school' as const, scopeId: null, roleId: 'support', isOwnerRole: false }));
  // First use of this grant is logged once, so the school can see when support actually looked.
  // Parallel requests (layout and page) serialize on a per-grant lock so it is logged only once.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${g.id}))`);
  const [seen] = await tx
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, 'support.session_started'), eq(auditLogs.targetId, g.id)))
    .limit(1);
  if (!seen) {
    await audit(tx, { tenantId, actorUserId: userId, actorKind: 'support', action: 'support.session_started', targetType: 'support_grant', targetId: g.id, metadata: { scopes: g.scopes } });
  }
  return { grant: g, grants };
}
