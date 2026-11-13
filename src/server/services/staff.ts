// Staff management: list, invite (link-based), accept, suspend, remove.
// Invitations are delivered as a one-time link the admin copies and sends;
// email delivery comes later. Only the token's hash is stored.
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, count, countDistinct, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { audiences, grades, invitations, membershipRoles, memberships, plans, rolePermissions, roles, subscriptions, user } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, can, isOwner, type AuthzContext, type ScopeType } from '../rbac/authorize';
import { assertCanAssignRole } from '../rbac/escalation';
import { ValidationError } from './modules';
import { assertTenantOpen } from '../tenancy/tenants';

export const INVITE_DAYS = 7;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function deny(msg: string): never {
  throw new AuthorizationError(msg);
}

async function roleSummary(tx: Tx, roleId: string) {
  if (!UUID.test(roleId)) throw new ValidationError('Choose a role.');
  const [role] = await tx.select().from(roles).where(eq(roles.id, roleId));
  if (!role) throw new ValidationError('Choose a role.');
  const perms = await tx.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  return { ...role, permissions: perms.map((x) => x.p) };
}

async function assertScopeTarget(tx: Tx, scopeType: ScopeType, scopeId: string | null) {
  if (scopeType === 'grade') {
    const [g] = scopeId && UUID.test(scopeId) ? await tx.select({ id: grades.id }).from(grades).where(eq(grades.id, scopeId)) : [];
    if (!g) throw new ValidationError('Choose a grade.');
  }
  if (scopeType === 'audience') {
    const [a] = scopeId && UUID.test(scopeId) ? await tx.select({ id: audiences.id }).from(audiences).where(eq(audiences.id, scopeId)) : [];
    if (!a) throw new ValidationError('Choose an audience.');
  }
}

/** Active + invited staff + pending invitations, against the plan's staff limit. */
async function staffSeats(tx: Tx, tenantId: string) {
  const [m] = await tx
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.kind, 'staff'), ne(memberships.status, 'suspended')));
  const [i] = await tx
    .select({ n: count() })
    .from(invitations)
    .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())));
  const [p] = await tx
    .select({ limit: plans.staffUserLimit })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantId));
  return { used: (m?.n ?? 0) + (i?.n ?? 0), limit: p?.limit ?? null };
}

// ---------- Reads ----------

export async function listStaff(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!can(ctx, 'users.view')) deny('Not allowed: users.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const members = await tx
        .select({ m: memberships, name: user.name, email: user.email })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(memberships.kind, 'staff'))
        .orderBy(asc(user.name));
      const grants = members.length
        ? await tx
            .select({ id: membershipRoles.id, membershipId: membershipRoles.membershipId, scopeType: membershipRoles.scopeType, scopeId: membershipRoles.scopeId, roleId: roles.id, roleName: roles.name, isOwnerRole: roles.isOwnerRole })
            .from(membershipRoles)
            .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
            .where(inArray(membershipRoles.membershipId, members.map((x) => x.m.id)))
        : [];
      const pending = await tx
        .select({ inv: invitations, roleName: roles.name })
        .from(invitations)
        .innerJoin(roles, eq(roles.id, invitations.roleId))
        .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .orderBy(desc(invitations.createdAt));
      return {
        members: members.map((x) => ({ ...x.m, name: x.name, email: x.email, grants: grants.filter((g) => g.membershipId === x.m.id) })),
        invitations: pending.map((p) => ({ ...p.inv, roleName: p.roleName, expired: p.inv.expiresAt <= new Date() })),
        seats: await staffSeats(tx, ctx.tenantId),
      };
    },
    db,
  );
}

/** Roles, grades and audiences for the pickers. */
export async function listRoleOptions(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => ({
      // The Parent role is for family accounts, not staff.
      roles: await tx
        .select({ id: roles.id, name: roles.name, description: roles.description, isOwnerRole: roles.isOwnerRole, isSystem: roles.isSystem })
        .from(roles)
        .where(ne(roles.key, 'parent'))
        .orderBy(asc(roles.createdAt)),
      grades: await tx.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sortOrder)),
      audiences: await tx.select({ id: audiences.id, name: audiences.name }).from(audiences).orderBy(asc(audiences.name)),
    }),
    db,
  );
}

// ---------- Invitations ----------

export const inviteSchema = z
  .object({
    email: z.email('Enter a valid email address.').transform((e) => e.trim().toLowerCase()),
    name: z.string().trim().min(1, 'Name is required.').max(120),
    title: z.string().trim().max(120).default(''),
    roleId: z.string(),
    scopeType: z.enum(['school', 'grade', 'audience']).default('school'),
    scopeId: z.string().nullable().default(null),
  })
  .strict();

/** Creates an invitation and returns the raw token (shown once, never stored). */
export async function inviteStaff(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!can(ctx, 'users.invite')) deny('You do not have permission to invite people.');
  const p = inviteSchema.safeParse(input);
  if (!p.success) throw new ValidationError(p.error.issues.map((i) => i.message).join(' '));
  const v = p.data;
  const scopeId = v.scopeType === 'school' ? null : v.scopeId;
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const role = await roleSummary(tx, v.roleId);
      if (role.key === 'parent') throw new ValidationError('Family accounts are not invited from the staff page.');
      await assertScopeTarget(tx, v.scopeType, scopeId);
      // Same escalation rules as assigning a role to an existing member.
      assertCanAssignRole(ctx, { role, targetUserId: `invite:${v.email}`, scopeType: v.scopeType, scopeId });
      const [existing] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(user.email, v.email));
      if (existing) throw new ValidationError('That person is already a member of this school. Give them a role from the staff list instead.');
      const seats = await staffSeats(tx, ctx.tenantId);
      if (seats.limit !== null && seats.used >= seats.limit) {
        throw new ValidationError(`Your plan includes ${seats.limit} staff accounts and all are in use or invited.`);
      }
      // A new invitation replaces any earlier pending one for the same email.
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.email, v.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      const token = randomBytes(32).toString('base64url');
      const [inv] = await tx
        .insert(invitations)
        .values({
          tenantId: ctx.tenantId,
          email: v.email,
          name: v.name,
          title: v.title || null,
          roleId: role.id,
          scopeType: v.scopeType,
          scopeId,
          tokenHash: hashToken(token),
          invitedByUserId: ctx.userId,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000),
        })
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'staff.invited',
        targetType: 'invitation',
        targetId: inv!.id,
        metadata: { email: v.email, roleKey: role.key, scopeType: v.scopeType },
      });
      return { invitation: inv!, token };
    },
    db,
  );
}

export async function revokeInvitation(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!can(ctx, 'users.invite')) deny('You do not have permission to manage invitations.');
  if (!UUID.test(id)) throw new ValidationError('Invitation not found.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [row] = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .returning();
      if (!row) throw new ValidationError('Invitation not found or already used.');
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'staff.invite_revoked', targetType: 'invitation', targetId: id });
    },
    db,
  );
}

export type InvitationView =
  | { state: 'valid'; email: string; name: string; roleName: string; existingUser: boolean }
  | { state: 'used' | 'expired' | 'invalid' };

async function findByToken(tx: Tx, token: string) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
  const [row] = await tx
    .select({ inv: invitations, roleName: roles.name })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .where(eq(invitations.tokenHash, hashToken(token)));
  return row ?? null;
}

/** What the invitation page shows. Reveals nothing for unknown tokens. */
export async function viewInvitation(tenantId: string, token: string, db: Db = platformDb()): Promise<InvitationView> {
  return withTenant(
    tenantId,
    async (tx) => {
      const row = await findByToken(tx, token);
      if (!row || row.inv.revokedAt) return { state: 'invalid' };
      if (row.inv.acceptedAt) return { state: 'used' };
      if (row.inv.expiresAt <= new Date()) return { state: 'expired' };
      const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, row.inv.email));
      return { state: 'valid', email: row.inv.email, name: row.inv.name, roleName: row.roleName, existingUser: !!u };
    },
    db,
  );
}

/**
 * Accepts an invitation for `userId`, whose account email must match the
 * invitation. Creates an active staff membership with the invited role.
 * Single use: the row is locked and marked accepted in the same transaction.
 */
export async function acceptInvitation(tenantId: string, token: string, userId: string, db: Db = platformDb()) {
  const [account] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!account) throw new ValidationError('Account not found.');
  await assertTenantOpen(tenantId, db);
  return withTenant(
    tenantId,
    async (tx) => {
      const row = await findByToken(tx, token);
      if (!row || row.inv.revokedAt || row.inv.acceptedAt || row.inv.expiresAt <= new Date()) {
        throw new ValidationError('This invitation is no longer valid. Ask the school for a new one.');
      }
      const [locked] = await tx.select().from(invitations).where(eq(invitations.id, row.inv.id)).for('update');
      if (!locked || locked.acceptedAt || locked.revokedAt) throw new ValidationError('This invitation has already been used.');
      if (account.email.toLowerCase() !== locked.email) {
        throw new ValidationError(`This invitation is for ${locked.email}. Sign in with that email to accept it.`);
      }
      const [existing] = await tx.select().from(memberships).where(eq(memberships.userId, userId));
      if (existing) throw new ValidationError('You are already a member of this school.');
      const [m] = await tx
        .insert(memberships)
        .values({ tenantId, userId, kind: 'staff', status: 'active', title: locked.title, invitedByUserId: locked.invitedByUserId })
        .returning();
      await tx.insert(membershipRoles).values({
        tenantId,
        membershipId: m!.id,
        roleId: locked.roleId,
        scopeType: locked.scopeType,
        scopeId: locked.scopeId,
        grantedByUserId: locked.invitedByUserId,
      });
      await tx.update(invitations).set({ acceptedAt: new Date(), acceptedByUserId: userId }).where(eq(invitations.id, locked.id));
      await audit(tx, { tenantId, actorUserId: userId, action: 'staff.invite_accepted', targetType: 'membership', targetId: m!.id, metadata: { invitationId: locked.id } });
      return m!;
    },
    db,
  );
}

// ---------- Members ----------

async function loadMember(tx: Tx, membershipId: string) {
  if (!UUID.test(membershipId)) throw new ValidationError('Member not found.');
  const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!m) throw new ValidationError('Member not found.');
  const ownerGrants = await tx
    .select({ id: membershipRoles.id })
    .from(membershipRoles)
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(membershipRoles.membershipId, m.id), eq(roles.isOwnerRole, true)));
  return { ...m, isOwnerMember: ownerGrants.length > 0 };
}

async function activeOwnerCount(tx: Tx) {
  const [c] = await tx
    .select({ n: countDistinct(memberships.id) })
    .from(membershipRoles)
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
    .where(and(eq(roles.isOwnerRole, true), eq(memberships.status, 'active')));
  return c?.n ?? 0;
}

function guardTarget(ctx: AuthzContext, target: { userId: string; isOwnerMember: boolean; status: string }, ownersLeft: number) {
  if (target.userId === ctx.userId) deny('You cannot suspend or remove yourself.');
  if (target.isOwnerMember && !isOwner(ctx)) deny('Only a School Owner can change another owner.');
  if (target.isOwnerMember && target.status === 'active' && ownersLeft < 1) deny('A school must keep at least one active owner.');
}

export async function setMemberSuspended(ctx: AuthzContext, membershipId: string, suspended: boolean, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!can(ctx, 'users.suspend')) deny('You do not have permission to suspend people.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const m = await loadMember(tx, membershipId);
      const owners = await activeOwnerCount(tx);
      if (suspended) guardTarget(ctx, m, owners - (m.isOwnerMember && m.status === 'active' ? 1 : 0));
      else if (m.isOwnerMember && !isOwner(ctx)) deny('Only a School Owner can change another owner.');
      const status = suspended ? 'suspended' : 'active';
      await tx.update(memberships).set({ status, updatedAt: new Date() }).where(eq(memberships.id, m.id));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: suspended ? 'staff.suspended' : 'staff.reactivated',
        targetType: 'membership',
        targetId: m.id,
      });
    },
    db,
  );
}

/** Removes the person from this school. Their account and other schools are untouched. */
export async function removeMember(ctx: AuthzContext, membershipId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!can(ctx, 'users.remove')) deny('You do not have permission to remove people.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const m = await loadMember(tx, membershipId);
      const owners = await activeOwnerCount(tx);
      guardTarget(ctx, m, owners - (m.isOwnerMember && m.status === 'active' ? 1 : 0));
      await tx.delete(memberships).where(eq(memberships.id, m.id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'staff.removed', targetType: 'membership', targetId: m.id, metadata: { userId: m.userId } });
    },
    db,
  );
}
