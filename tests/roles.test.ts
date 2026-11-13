// Custom roles editor: create, edit, delete, and the escalation limits.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { grades, membershipRoles, memberships, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { can } from '@/server/rbac/authorize';
import { assignRole, createRoleFromEditor, deleteCustomRole, getRoleForEditor, updateCustomRole } from '@/server/services/people';
import { inviteStaff, revokeInvitation } from '@/server/services/staff';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

async function addMember(tenantId: string, roleKey: string | null) {
  const userId = await createUser(`m-${roleKey}`);
  const membershipId = await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    if (roleKey) {
      const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
      await tx.insert(membershipRoles).values({ tenantId, membershipId: m!.id, roleId: r!.id, scopeType: 'school', scopeId: null });
    }
    return m!.id;
  });
  return { userId, membershipId, ctx: async () => (await loadAuthzContext(tenantId, userId))! };
}

beforeAll(async () => {
  a = await createSchool('roles-a');
  b = await createSchool('roles-b');
});
afterAll(async () => {
  await closeDb();
});

describe('custom roles', () => {
  it('creates, edits and the change reaches people who hold it', async () => {
    const role = await createRoleFromEditor(a.ownerCtx, { name: 'Front office', description: 'Desk', permissions: ['dashboard.view', 'events.view'] });
    expect(role.key).toMatch(/^front_office_[0-9a-f]{4}$/);
    const m = await addMember(a.tenant.id, null);
    await assignRole(a.ownerCtx, { membershipId: m.membershipId, roleId: role.id, scopeType: 'school', scopeId: null });
    expect(can(await m.ctx(), 'announcements.create')).toBe(false);

    await updateCustomRole(a.ownerCtx, role.id, { name: 'Front desk', permissions: ['dashboard.view', 'events.view', 'announcements.create'] });
    expect(can(await m.ctx(), 'announcements.create')).toBe(true);
    const r = await getRoleForEditor(a.ownerCtx, role.id);
    expect(r?.name).toBe('Front desk');
    expect(r?.permissions.sort()).toEqual(['announcements.create', 'dashboard.view', 'events.view']);
  });

  it('refuses duplicate names, empty names, unknown and owner-only permissions', async () => {
    await createRoleFromEditor(a.ownerCtx, { name: 'Librarian', permissions: [] });
    await expect(createRoleFromEditor(a.ownerCtx, { name: 'librarian', permissions: [] })).rejects.toThrow(/already has that name/);
    await expect(createRoleFromEditor(a.ownerCtx, { name: '  ', permissions: [] })).rejects.toThrow(/name is required/);
    await expect(createRoleFromEditor(a.ownerCtx, { name: 'X1', permissions: ['nope.nope'] })).rejects.toThrow(/Unknown/);
    // Even the owner cannot put owner-only permissions into a custom role.
    await expect(createRoleFromEditor(a.ownerCtx, { name: 'X2', permissions: ['domains.manage'] })).rejects.toThrow(/Only the owner role/);
  });

  it('built-in and owner roles cannot be edited or deleted', async () => {
    const teacherId = await withTenant(a.tenant.id, async (tx) => (await tx.select().from(roles).where(eq(roles.key, 'teacher')))[0]!.id);
    const ownerId = await withTenant(a.tenant.id, async (tx) => (await tx.select().from(roles).where(eq(roles.key, 'owner')))[0]!.id);
    await expect(updateCustomRole(a.ownerCtx, teacherId, { name: 'T', permissions: [] })).rejects.toThrow(/Built-in/);
    await expect(deleteCustomRole(a.ownerCtx, ownerId)).rejects.toThrow(/Built-in|owner role/);
  });

  it('admins cannot add permissions they lack, nor strip ones above them; teachers cannot edit at all', async () => {
    const admin = await addMember(a.tenant.id, 'school_admin');
    const teacher = await addMember(a.tenant.id, 'teacher');
    await expect(createRoleFromEditor(await teacher.ctx(), { name: 'T role', permissions: [] })).rejects.toThrow(/manage roles/);
    const role = await createRoleFromEditor(await admin.ctx(), { name: 'Helper', permissions: ['dashboard.view'] });
    // Make admin lose events.import, then try to edit a role that has it.
    const withImport = await createRoleFromEditor(a.ownerCtx, { name: 'Importer', permissions: ['events.import'] });
    const narrowAdmin = await createRoleFromEditor(a.ownerCtx, { name: 'Narrow admin', permissions: ['roles.manage', 'dashboard.view'] });
    const n = await addMember(a.tenant.id, null);
    await assignRole(a.ownerCtx, { membershipId: n.membershipId, roleId: narrowAdmin.id, scopeType: 'school', scopeId: null });
    await expect(updateCustomRole(await n.ctx(), withImport.id, { name: 'Importer', permissions: [] })).rejects.toThrow(/do not hold/);
    await expect(updateCustomRole(await n.ctx(), role.id, { name: 'Helper', permissions: ['dashboard.view', 'events.import'] })).rejects.toThrow(/do not hold/);
    await expect(updateCustomRole(await n.ctx(), role.id, { name: 'Helper 2', permissions: ['dashboard.view'] })).resolves.toBeUndefined();
  });

  it('a role given for one grade cannot gain school-wide permissions', async () => {
    const gradeId = await withTenant(a.tenant.id, async (tx) => {
      const [g] = await tx.insert(grades).values({ tenantId: a.tenant.id, code: 'g9r', name: 'Grade 9 roles', level: 'high', sortOrder: 99 }).returning();
      return g!.id;
    });
    const role = await createRoleFromEditor(a.ownerCtx, { name: 'Grade lead', permissions: ['events.create'] });
    const m = await addMember(a.tenant.id, null);
    await assignRole(a.ownerCtx, { membershipId: m.membershipId, roleId: role.id, scopeType: 'grade', scopeId: gradeId });
    await expect(updateCustomRole(a.ownerCtx, role.id, { name: 'Grade lead', permissions: ['events.create', 'users.remove'] })).rejects.toThrow(/single grade/);
    await expect(updateCustomRole(a.ownerCtx, role.id, { name: 'Grade lead', permissions: ['events.create', 'events.edit'] })).resolves.toBeUndefined();
  });

  it('deletes only unused roles', async () => {
    const role = await createRoleFromEditor(a.ownerCtx, { name: 'Temp', permissions: ['dashboard.view'] });
    const m = await addMember(a.tenant.id, null);
    const grant = await assignRole(a.ownerCtx, { membershipId: m.membershipId, roleId: role.id, scopeType: 'school', scopeId: null });
    await expect(deleteCustomRole(a.ownerCtx, role.id)).rejects.toThrow(/people have this role/);
    await withTenant(a.tenant.id, (tx) => tx.delete(membershipRoles).where(eq(membershipRoles.id, grant!.id)));
    const inv = await inviteStaff(a.ownerCtx, { email: `temp-${Date.now()}@example.test`, name: 'T', roleId: role.id });
    await expect(deleteCustomRole(a.ownerCtx, role.id)).rejects.toThrow(/pending invitation/);
    await revokeInvitation(a.ownerCtx, inv.invitation.id);
    await deleteCustomRole(a.ownerCtx, role.id);
    expect(await getRoleForEditor(a.ownerCtx, role.id)).toBeNull();
  });

  it('cannot see or change another school’s roles', async () => {
    const role = await createRoleFromEditor(b.ownerCtx, { name: 'B only', permissions: [] });
    expect(await getRoleForEditor(a.ownerCtx, role.id)).toBeNull();
    await expect(updateCustomRole(a.ownerCtx, role.id, { name: 'Hijack', permissions: [] })).rejects.toThrow(/not found/);
    await expect(deleteCustomRole(a.ownerCtx, role.id)).rejects.toThrow(/not found/);
  });
});
