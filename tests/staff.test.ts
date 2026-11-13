// Staff management: invitations (single use, expiry, email match, seats,
// escalation), suspend/remove guards and tenant isolation.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { invitations, membershipRoles, memberships, plans, roles, user } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { can } from '@/server/rbac/authorize';
import {
  acceptInvitation,
  inviteStaff,
  listStaff,
  removeMember,
  revokeInvitation,
  setMemberSuspended,
  viewInvitation,
} from '@/server/services/staff';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

async function roleId(tenantId: string, key: string) {
  return withTenant(tenantId, async (tx) => (await tx.select().from(roles).where(eq(roles.key, key)))[0]!.id);
}

async function userWithEmail(email: string) {
  const id = randomUUID();
  await platformDb().insert(user).values({ id, name: email, email, emailVerified: true });
  return id;
}

async function addMember(tenantId: string, roleKey: string) {
  const userId = await createUser(`member-${roleKey}`);
  const membershipId = await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
    await tx.insert(membershipRoles).values({ tenantId, membershipId: m!.id, roleId: r!.id, scopeType: 'school', scopeId: null });
    return m!.id;
  });
  return { userId, membershipId, ctx: (await loadAuthzContext(tenantId, userId))! };
}

async function ownerMembershipId(s: typeof a) {
  return withTenant(s.tenant.id, async (tx) => (await tx.select().from(memberships).where(eq(memberships.userId, s.ownerId)))[0]!.id);
}

const email = () => `invitee-${randomUUID().slice(0, 8)}@example.test`;

beforeAll(async () => {
  a = await createSchool('staff-a');
  b = await createSchool('staff-b');
});
afterAll(async () => {
  await closeDb();
});

describe('invitations', () => {
  it('invites, shows the invitation, and accepting creates an active member with the role', async () => {
    const to = email();
    const { token, invitation } = await inviteStaff(a.ownerCtx, { email: to.toUpperCase(), name: 'New Teacher', title: 'Grade 3', roleId: await roleId(a.tenant.id, 'teacher') });
    expect(invitation.email).toBe(to);
    expect(invitation.tokenHash).not.toContain(token);
    const view = await viewInvitation(a.tenant.id, token);
    expect(view).toMatchObject({ state: 'valid', email: to, roleName: 'Teacher', existingUser: false });

    const userId = await userWithEmail(to);
    expect(await viewInvitation(a.tenant.id, token)).toMatchObject({ existingUser: true });
    const m = await acceptInvitation(a.tenant.id, token, userId);
    expect(m.status).toBe('active');
    const ctx = (await loadAuthzContext(a.tenant.id, userId))!;
    expect(ctx.grants.some((g) => g.roleId === invitation.roleId)).toBe(true);
    expect(can(ctx, 'documents.upload')).toBe(true);
    expect(can(ctx, 'users.invite')).toBe(false);

    // Single use.
    expect(await viewInvitation(a.tenant.id, token)).toEqual({ state: 'used' });
    await expect(acceptInvitation(a.tenant.id, token, userId)).rejects.toThrow(/no longer valid/);
  });

  it('refuses an account whose email does not match', async () => {
    const { token } = await inviteStaff(a.ownerCtx, { email: email(), name: 'X', roleId: await roleId(a.tenant.id, 'teacher') });
    const other = await createUser('someone else');
    await expect(acceptInvitation(a.tenant.id, token, other)).rejects.toThrow(/This invitation is for/);
    expect(await viewInvitation(a.tenant.id, token)).toMatchObject({ state: 'valid' });
  });

  it('expired, revoked, replaced, malformed and other-school tokens are refused', async () => {
    const tid = await roleId(a.tenant.id, 'teacher');
    const to = email();
    const first = await inviteStaff(a.ownerCtx, { email: to, name: 'X', roleId: tid });
    const second = await inviteStaff(a.ownerCtx, { email: to, name: 'X', roleId: tid });
    expect(await viewInvitation(a.tenant.id, first.token)).toEqual({ state: 'invalid' });
    expect(await viewInvitation(a.tenant.id, second.token)).toMatchObject({ state: 'valid' });

    // A token from school A means nothing in school B.
    expect(await viewInvitation(b.tenant.id, second.token)).toEqual({ state: 'invalid' });
    await expect(acceptInvitation(b.tenant.id, second.token, await userWithEmail(email()))).rejects.toThrow(/no longer valid/);

    await withTenant(a.tenant.id, (tx) => tx.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.id, second.invitation.id)));
    expect(await viewInvitation(a.tenant.id, second.token)).toEqual({ state: 'expired' });
    await expect(acceptInvitation(a.tenant.id, second.token, await userWithEmail(to))).rejects.toThrow(/no longer valid/);

    const third = await inviteStaff(a.ownerCtx, { email: email(), name: 'X', roleId: tid });
    await revokeInvitation(a.ownerCtx, third.invitation.id);
    expect(await viewInvitation(a.tenant.id, third.token)).toEqual({ state: 'invalid' });
    // Another school's admin cannot revoke it.
    const fourth = await inviteStaff(a.ownerCtx, { email: email(), name: 'X', roleId: tid });
    await expect(revokeInvitation(b.ownerCtx, fourth.invitation.id)).rejects.toThrow(/not found/);

    expect(await viewInvitation(a.tenant.id, 'short')).toEqual({ state: 'invalid' });
    expect(await viewInvitation(a.tenant.id, 'x'.repeat(43))).toEqual({ state: 'invalid' });
  });

  it('refuses inviting an existing member, bad input and roles from another school', async () => {
    const member = await addMember(a.tenant.id, 'teacher');
    const [u] = await platformDb().select().from(user).where(eq(user.id, member.userId));
    const tid = await roleId(a.tenant.id, 'teacher');
    await expect(inviteStaff(a.ownerCtx, { email: u!.email, name: 'Dup', roleId: tid })).rejects.toThrow(/already a member/);
    await expect(inviteStaff(a.ownerCtx, { email: email(), name: 'X', roleId: await roleId(a.tenant.id, 'parent') })).rejects.toThrow(/Family accounts/);
    await expect(inviteStaff(a.ownerCtx, { email: 'not-an-email', name: 'X', roleId: tid })).rejects.toThrow(/valid email/);
    await expect(inviteStaff(a.ownerCtx, { email: email(), name: 'X', roleId: await roleId(b.tenant.id, 'teacher') })).rejects.toThrow(/Choose a role/);
    await expect(inviteStaff(a.ownerCtx, { email: email(), name: 'X', roleId: tid, tenantId: b.tenant.id })).rejects.toThrow();
  });

  it('applies escalation rules: no invite permission, no owner role, no permissions you lack', async () => {
    const teacher = await addMember(a.tenant.id, 'teacher');
    await expect(inviteStaff(teacher.ctx, { email: email(), name: 'X', roleId: await roleId(a.tenant.id, 'teacher') })).rejects.toThrow(/permission to invite/);

    const admin = await addMember(a.tenant.id, 'school_admin');
    await expect(inviteStaff(admin.ctx, { email: email(), name: 'X', roleId: await roleId(a.tenant.id, 'owner') })).rejects.toThrow(/Only the School Owner/);
    // A school-wide role cannot be limited to a grade.
    await expect(
      inviteStaff(admin.ctx, { email: email(), name: 'X', roleId: await roleId(a.tenant.id, 'school_admin'), scopeType: 'grade', scopeId: randomUUID() }),
    ).rejects.toThrow(/grade/);
    // Admin can invite a teacher.
    const ok = await inviteStaff(admin.ctx, { email: email(), name: 'X', roleId: await roleId(a.tenant.id, 'teacher') });
    expect(ok.token.length).toBeGreaterThan(30);
  });

  it('enforces the plan staff limit, counting pending invitations', async () => {
    await platformDb().insert(plans).values({ id: 'test-two-staff', name: 'Two staff', includedModules: ['home'], storageLimitMb: 100, staffUserLimit: 2 }).onConflictDoNothing();
    const s = await createSchool('staff-seats', { planId: 'test-two-staff' });
    const tid = await roleId(s.tenant.id, 'teacher');
    // Owner uses one seat; one invitation uses the second.
    const inv = await inviteStaff(s.ownerCtx, { email: email(), name: 'X', roleId: tid });
    await expect(inviteStaff(s.ownerCtx, { email: email(), name: 'Y', roleId: tid })).rejects.toThrow(/plan includes 2 staff/);
    // Revoking frees the seat.
    await revokeInvitation(s.ownerCtx, inv.invitation.id);
    await inviteStaff(s.ownerCtx, { email: email(), name: 'Y', roleId: tid });
    const list = await listStaff(s.ownerCtx);
    expect(list.seats).toEqual({ used: 2, limit: 2 });
  });
});

describe('suspend and remove', () => {
  it('suspends and reactivates; suspended members lose access', async () => {
    const t = await addMember(a.tenant.id, 'teacher');
    await setMemberSuspended(a.ownerCtx, t.membershipId, true);
    expect(can((await loadAuthzContext(a.tenant.id, t.userId))!, 'dashboard.view')).toBe(false);
    await setMemberSuspended(a.ownerCtx, t.membershipId, false);
    expect(can((await loadAuthzContext(a.tenant.id, t.userId))!, 'dashboard.view')).toBe(true);
  });

  it('protects owners and the acting user', async () => {
    const admin = await addMember(a.tenant.id, 'school_admin');
    const ownerM = await ownerMembershipId(a);
    await expect(setMemberSuspended(admin.ctx, ownerM, true)).rejects.toThrow(/Only a School Owner/);
    await expect(removeMember(admin.ctx, ownerM)).rejects.toThrow(/Only a School Owner/);
    await expect(removeMember(admin.ctx, admin.membershipId)).rejects.toThrow(/yourself/);
    await expect(setMemberSuspended(a.ownerCtx, ownerM, true)).rejects.toThrow(/yourself/);

    // A second owner can be removed by the first, but the last owner stays.
    const owner2 = await addMember(a.tenant.id, 'owner');
    await expect(removeMember(owner2.ctx, ownerM)).resolves.toBeUndefined();
    const teacher = await addMember(a.tenant.id, 'teacher');
    await expect(removeMember(teacher.ctx, owner2.membershipId)).rejects.toThrow(/permission to remove/);
  });

  it('keeps at least one active owner', async () => {
    const s = await createSchool('staff-owner');
    const owner2 = await addMember(s.tenant.id, 'owner');
    const ownerM = await ownerMembershipId(s);
    await setMemberSuspended(owner2.ctx, ownerM, true);
    // owner2 is now the only active owner; owner1 is suspended and cannot act.
    const admin = await addMember(s.tenant.id, 'school_admin');
    await expect(setMemberSuspended(admin.ctx, owner2.membershipId, true)).rejects.toThrow(/Only a School Owner/);
    expect(can((await loadAuthzContext(s.tenant.id, s.ownerId))!, 'dashboard.view')).toBe(false);
  });

  it('cannot reach members of another school', async () => {
    const t = await addMember(b.tenant.id, 'teacher');
    await expect(setMemberSuspended(a.ownerCtx, t.membershipId, true)).rejects.toThrow(/Member not found/);
    await expect(removeMember(a.ownerCtx, t.membershipId)).rejects.toThrow(/Member not found/);
    const list = await listStaff(a.ownerCtx);
    expect(list.members.some((m) => m.id === t.membershipId)).toBe(false);
  });
});
