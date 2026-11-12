import { and, count, eq } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from '../db/client';
import { membershipRoles, memberships, rolePermissions, roles } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, type AuthzContext, type ScopeType } from '../rbac/authorize';
import { assertCanAssignRole, assertCanRevokeRole, assertCanSetRolePermissions } from '../rbac/escalation';
import { ValidationError } from './modules';

async function loadRole(tx: Parameters<Parameters<typeof withTenant>[1]>[0], tenantId: string, roleId: string) {
  const [role] = await tx.select().from(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId))).limit(1);
  if (!role) throw new AuthorizationError('Role not found.');
  const perms = await tx
    .select({ p: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, role.id));
  return { ...role, permissions: perms.map((r) => r.p) };
}

export async function assignRole(
  actor: AuthzContext,
  input: { membershipId: string; roleId: string; scopeType: ScopeType; scopeId: string | null },
  db: Db = platformDb(),
) {
  assertVerifiedContext(actor);
  return withTenant(
    actor.tenantId,
    async (tx) => {
      const [target] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.tenantId, actor.tenantId), eq(memberships.id, input.membershipId)))
        .limit(1);
      // RLS already hides other schools' members; this also covers bad ids.
      if (!target) throw new AuthorizationError('Member not found.');
      const role = await loadRole(tx, actor.tenantId, input.roleId);
      assertCanAssignRole(actor, {
        role,
        targetUserId: target.userId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
      });
      const [row] = await tx
        .insert(membershipRoles)
        .values({
          tenantId: actor.tenantId,
          membershipId: target.id,
          roleId: role.id,
          scopeType: input.scopeType,
          scopeId: input.scopeType === 'school' || input.scopeType === 'own' ? null : input.scopeId,
          grantedByUserId: actor.userId,
        })
        .onConflictDoNothing()
        .returning();
      await audit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'role.assigned',
        targetType: 'membership',
        targetId: target.id,
        metadata: { roleId: role.id, roleKey: role.key, scopeType: input.scopeType, scopeId: input.scopeId },
      });
      return row ?? null;
    },
    db,
  );
}

export async function revokeRole(actor: AuthzContext, membershipRoleId: string, db: Db = platformDb()) {
  assertVerifiedContext(actor);
  return withTenant(
    actor.tenantId,
    async (tx) => {
      const [mr] = await tx
        .select({ mr: membershipRoles, userId: memberships.userId })
        .from(membershipRoles)
        .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
        .where(and(eq(membershipRoles.tenantId, actor.tenantId), eq(membershipRoles.id, membershipRoleId)))
        .limit(1);
      if (!mr) throw new AuthorizationError('Role assignment not found.');
      const role = await loadRole(tx, actor.tenantId, mr.mr.roleId);
      let remainingOwnerCount = 1;
      if (role.isOwnerRole) {
        const [c] = await tx
          .select({ n: count() })
          .from(membershipRoles)
          .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
          .where(and(eq(membershipRoles.roleId, role.id), eq(memberships.status, 'active')));
        remainingOwnerCount = (c?.n ?? 0) - 1;
      }
      assertCanRevokeRole(actor, { role, targetUserId: mr.userId, remainingOwnerCount });
      await tx.delete(membershipRoles).where(eq(membershipRoles.id, membershipRoleId));
      await audit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'role.revoked',
        targetType: 'membership',
        targetId: mr.mr.membershipId,
        metadata: { roleId: role.id, roleKey: role.key },
      });
    },
    db,
  );
}

export async function createCustomRole(
  actor: AuthzContext,
  input: { key: string; name: string; description?: string; permissions: string[] },
  db: Db = platformDb(),
) {
  assertVerifiedContext(actor);
  if (!/^[a-z0-9_]{2,40}$/.test(input.key)) throw new ValidationError('Role key must be 2-40 lowercase letters, digits or _.');
  if (!input.name.trim()) throw new ValidationError('Role name is required.');
  const permissions = [...new Set(input.permissions)];
  assertCanSetRolePermissions(actor, null, permissions);
  return withTenant(
    actor.tenantId,
    async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({ tenantId: actor.tenantId, key: input.key, name: input.name.trim(), description: input.description })
        .returning();
      if (permissions.length) {
        await tx
          .insert(rolePermissions)
          .values(permissions.map((permission) => ({ tenantId: actor.tenantId, roleId: role!.id, permission })));
      }
      await audit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'role.created',
        targetType: 'role',
        targetId: role!.id,
        metadata: { key: input.key, permissions },
      });
      return role!;
    },
    db,
  );
}
