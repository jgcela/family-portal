import { randomBytes } from 'node:crypto';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from '../db/client';
import { invitations, membershipRoles, memberships, rolePermissions, roles } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, can, type AuthzContext, type ScopeType } from '../rbac/authorize';
import { getPermission } from '../rbac/permissions';
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

// ---------- Custom roles editor ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A stable internal key from the name, e.g. "Front office" → "front_office_3f9a". */
export function roleKeyFromName(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  return `${base || 'role'}_${randomBytes(2).toString('hex')}`;
}

function cleanRoleInput(input: { name: string; description?: string | null; permissions: string[] }) {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Role name is required.');
  if (name.length > 60) throw new ValidationError('Role name must be 60 characters or fewer.');
  const description = (input.description ?? '').trim();
  if (description.length > 300) throw new ValidationError('Description must be 300 characters or fewer.');
  return { name, description: description || null, permissions: [...new Set(input.permissions)] };
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function assertUniqueName(tx: Tx, name: string, exceptId: string | null) {
  const same = await tx.select({ id: roles.id, name: roles.name }).from(roles);
  if (same.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) {
    throw new ValidationError('Another role already has that name.');
  }
}

/** Roles for the editor list, with how many people and pending invitations use each. */
export async function listRolesForEditor(actor: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(actor);
  if (!can(actor, 'roles.view')) throw new AuthorizationError('Not allowed: roles.view');
  return withTenant(
    actor.tenantId,
    async (tx) => {
      const rows = await tx.select().from(roles).orderBy(asc(roles.createdAt));
      const perms = await tx.select().from(rolePermissions);
      const grants = await tx.select({ roleId: membershipRoles.roleId, n: count() }).from(membershipRoles).groupBy(membershipRoles.roleId);
      return {
        roles: rows.map((r) => ({
          ...r,
          permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission),
          holders: grants.find((g) => g.roleId === r.id)?.n ?? 0,
        })),
      };
    },
    db,
  );
}

export async function getRoleForEditor(actor: AuthzContext, roleId: string, db: Db = platformDb()) {
  assertVerifiedContext(actor);
  if (!can(actor, 'roles.view')) throw new AuthorizationError('Not allowed: roles.view');
  if (!UUID.test(roleId)) return null;
  return withTenant(
    actor.tenantId,
    async (tx) => {
      const [r] = await tx.select().from(roles).where(eq(roles.id, roleId));
      if (!r) return null;
      return loadRole(tx, actor.tenantId, r.id);
    },
    db,
  );
}

export async function createRoleFromEditor(
  actor: AuthzContext,
  input: { name: string; description?: string | null; permissions: string[] },
  db: Db = platformDb(),
) {
  const v = cleanRoleInput(input);
  assertVerifiedContext(actor);
  assertCanSetRolePermissions(actor, null, v.permissions);
  await withTenant(actor.tenantId, (tx) => assertUniqueName(tx, v.name, null), db);
  return createCustomRole(actor, { key: roleKeyFromName(v.name), name: v.name, description: v.description ?? undefined, permissions: v.permissions }, db);
}

/**
 * Edits a custom role. Changes apply to everyone who holds it. Permissions that
 * cannot be limited to a grade are refused while the role is granted for a grade
 * or audience, so an edit can't widen a limited grant to the whole school.
 */
export async function updateCustomRole(
  actor: AuthzContext,
  roleId: string,
  input: { name: string; description?: string | null; permissions: string[] },
  db: Db = platformDb(),
) {
  assertVerifiedContext(actor);
  const v = cleanRoleInput(input);
  if (!UUID.test(roleId)) throw new ValidationError('Role not found.');
  return withTenant(
    actor.tenantId,
    async (tx) => {
      const [locked] = await tx.select().from(roles).where(eq(roles.id, roleId)).for('update');
      if (!locked) throw new ValidationError('Role not found.');
      const role = await loadRole(tx, actor.tenantId, roleId);
      assertCanSetRolePermissions(actor, role, v.permissions);
      // You can't remove permissions you don't hold either: that would let you
      // reshape a role above your level.
      const ceiling = new Set(actor.grants.filter((g) => g.scopeType === 'school').map((g) => g.permission));
      const removedAbove = role.permissions.filter((p) => !v.permissions.includes(p) && !ceiling.has(p));
      if (removedAbove.length) throw new AuthorizationError(`You cannot change permissions you do not hold: ${removedAbove.join(', ')}`);
      const limited = await tx
        .select({ id: membershipRoles.id })
        .from(membershipRoles)
        .where(and(eq(membershipRoles.roleId, roleId), ne(membershipRoles.scopeType, 'school')));
      const limitedInv = await tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(and(eq(invitations.roleId, roleId), ne(invitations.scopeType, 'school'), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      const nonScopable = v.permissions.filter((p) => !getPermission(p)?.scopable && !role.permissions.includes(p));
      if ((limited.length || limitedInv.length) && nonScopable.length) {
        throw new ValidationError(
          `This role is given to some people for a single grade or audience, so it cannot gain school-wide permissions (${nonScopable.join(', ')}).`,
        );
      }
      await assertUniqueName(tx, v.name, roleId);
      await tx.update(roles).set({ name: v.name, description: v.description, updatedAt: new Date() }).where(eq(roles.id, roleId));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (v.permissions.length) {
        await tx.insert(rolePermissions).values(v.permissions.map((permission) => ({ tenantId: actor.tenantId, roleId, permission })));
      }
      await audit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'role.updated',
        targetType: 'role',
        targetId: roleId,
        metadata: {
          added: v.permissions.filter((p) => !role.permissions.includes(p)),
          removed: role.permissions.filter((p) => !v.permissions.includes(p)),
        },
      });
    },
    db,
  );
}

/** Deletes a custom role that nobody holds and no pending invitation uses. */
export async function deleteCustomRole(actor: AuthzContext, roleId: string, db: Db = platformDb()) {
  assertVerifiedContext(actor);
  if (!UUID.test(roleId)) throw new ValidationError('Role not found.');
  return withTenant(
    actor.tenantId,
    async (tx) => {
      const [locked] = await tx.select().from(roles).where(eq(roles.id, roleId)).for('update');
      if (!locked) throw new ValidationError('Role not found.');
      const role = await loadRole(tx, actor.tenantId, roleId);
      assertCanSetRolePermissions(actor, role, []);
      const [held] = await tx.select({ n: count() }).from(membershipRoles).where(eq(membershipRoles.roleId, roleId));
      if ((held?.n ?? 0) > 0) throw new ValidationError(`${held!.n} people have this role. Take it away from them first.`);
      const [inv] = await tx
        .select({ n: count() })
        .from(invitations)
        .where(and(eq(invitations.roleId, roleId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      if ((inv?.n ?? 0) > 0) throw new ValidationError('A pending invitation uses this role. Cancel it first.');
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      // Accepted/revoked invitations keep a reference; clear it by deleting those old rows.
      await tx.delete(invitations).where(eq(invitations.roleId, roleId));
      await tx.delete(roles).where(eq(roles.id, roleId));
      await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, action: 'role.deleted', targetType: 'role', targetId: roleId, metadata: { key: role.key, name: role.name } });
    },
    db,
  );
}
