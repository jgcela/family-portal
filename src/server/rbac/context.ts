// Loads a user's authorization context for one tenant, through RLS.
import { and, eq } from 'drizzle-orm';
import { withTenant, type Db, platformDb } from '../db/client';
import { membershipRoles, memberships, rolePermissions, roles, tenants } from '../db/schema';
import { AuthorizationError, type AuthzContext, type Grant } from './authorize';
import { activeSupportGrants } from '../services/support';

// Contexts are only trusted if they were produced by loadAuthzContext(). A copy,
// a hand-built object or a context with a swapped tenantId is rejected by
// services, so a tenant id can never be smuggled in from request input.
const verified = new WeakSet<AuthzContext>();

export function assertVerifiedContext(ctx: AuthzContext): void {
  if (!verified.has(ctx)) throw new AuthorizationError('Unverified authorization context.');
}

export async function loadAuthzContext(
  tenantId: string,
  userId: string,
  db: Db = platformDb(),
): Promise<AuthzContext | null> {
  // A suspended or archived school has no working dashboard: no context, no access.
  const [t] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId));
  if (!t || (t.status !== 'active' && t.status !== 'onboarding')) return null;
  return withTenant(
    tenantId,
    async (tx) => {
      const [m] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)))
        .limit(1);
      if (!m) {
        // No membership: maybe an approved, read-only platform support session.
        const sup = await activeSupportGrants(tx, tenantId, userId);
        if (!sup) return null;
        const ctx: AuthzContext = Object.freeze({
          userId,
          tenantId,
          membershipId: sup.grant.id,
          membershipStatus: 'active',
          grants: Object.freeze(sup.grants) as Grant[],
          support: Object.freeze({ grantId: sup.grant.id, expiresAt: sup.grant.expiresAt, scopes: [...sup.grant.scopes] }),
        });
        verified.add(ctx);
        return ctx;
      }
      const rows = await tx
        .select({
          permission: rolePermissions.permission,
          scopeType: membershipRoles.scopeType,
          scopeId: membershipRoles.scopeId,
          roleId: roles.id,
          isOwnerRole: roles.isOwnerRole,
        })
        .from(membershipRoles)
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(eq(membershipRoles.membershipId, m.id));
      const grants: Grant[] = rows.map((r) => Object.freeze({ ...r }));
      const ctx: AuthzContext = Object.freeze({
        userId,
        tenantId,
        membershipId: m.id,
        membershipStatus: m.status,
        grants: Object.freeze(grants) as Grant[],
      });
      verified.add(ctx);
      return ctx;
    },
    db,
  );
}
