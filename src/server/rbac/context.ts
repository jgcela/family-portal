// Loads a user's authorization context for one tenant, through RLS.
import { and, eq } from 'drizzle-orm';
import { withTenant, type Db, platformDb } from '../db/client';
import { membershipRoles, memberships, rolePermissions, roles } from '../db/schema';
import { AuthorizationError, type AuthzContext, type Grant } from './authorize';

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
  return withTenant(
    tenantId,
    async (tx) => {
      const [m] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)))
        .limit(1);
      if (!m) return null;
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
