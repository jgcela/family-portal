import { describe, expect, it } from 'vitest';
import { can, canApprove, hasAnywhere, type AuthzContext, type Grant } from '@/server/rbac/authorize';
import { assertCanAssignRole, assertCanRevokeRole, assertCanSetRolePermissions } from '@/server/rbac/escalation';
import { ALL_PERMISSION_KEYS } from '@/server/rbac/permissions';
import { getRoleTemplate, ROLE_TEMPLATES } from '@/server/rbac/role-templates';

const G5 = '00000000-0000-0000-0000-000000000005';
const G6 = '00000000-0000-0000-0000-000000000006';
const PK = '00000000-0000-0000-0000-0000000000aa';

function ctx(grants: Partial<Grant>[], opts: Partial<AuthzContext> = {}): AuthzContext {
  return {
    userId: 'u1',
    tenantId: 't1',
    membershipId: 'm1',
    membershipStatus: 'active',
    grants: grants.map((g) => ({
      permission: 'x',
      scopeType: 'school',
      scopeId: null,
      roleId: 'r',
      isOwnerRole: false,
      ...g,
    })) as Grant[],
    ...opts,
  };
}

function fromRole(key: string, scope: Partial<Grant> = {}, opts: Partial<AuthzContext> = {}) {
  const tpl = getRoleTemplate(key)!;
  return ctx(
    tpl.permissions.map((permission) => ({ permission, isOwnerRole: !!tpl.isOwnerRole, roleId: key, ...scope })),
    opts,
  );
}

describe('can()', () => {
  it('denies by default', () => {
    expect(can(null, 'events.create')).toBe(false);
    expect(can(ctx([]), 'events.create')).toBe(false);
    expect(can(ctx([{ permission: 'events.create' }]), 'events.delete')).toBe(false);
  });

  it('rejects unknown permissions even if granted', () => {
    expect(can(ctx([{ permission: 'everything.do' }]), 'everything.do')).toBe(false);
  });

  it('suspended or invited members have no permissions', () => {
    expect(can(fromRole('owner', {}, { membershipStatus: 'suspended' }), 'events.create')).toBe(false);
    expect(can(fromRole('owner', {}, { membershipStatus: 'invited' }), 'branding.manage')).toBe(false);
  });

  it('grade-scoped grants only cover records for that grade', () => {
    const teacher = fromRole('teacher', { scopeType: 'grade', scopeId: G5 });
    expect(can(teacher, 'events.create', { gradeIds: [G5] })).toBe(true);
    expect(can(teacher, 'events.create', { gradeIds: [G6] })).toBe(false);
    expect(can(teacher, 'events.create', { gradeIds: [G5, G6] })).toBe(false);
    // School-wide records are out of scope for a grade teacher.
    expect(can(teacher, 'events.create', {})).toBe(false);
    expect(can(teacher, 'events.create')).toBe(false);
    expect(hasAnywhere(teacher, 'events.create')).toBe(true);
  });

  it('multi-grade records need coverage for every grade', () => {
    const t = ctx([
      { permission: 'events.edit', scopeType: 'grade', scopeId: G5 },
      { permission: 'events.edit', scopeType: 'grade', scopeId: G6 },
    ]);
    expect(can(t, 'events.edit', { gradeIds: [G5, G6] })).toBe(true);
    expect(can(t, 'events.edit', { gradeIds: [G5, PK] })).toBe(false);
  });

  it('non-scopable permissions only count when school-wide', () => {
    const scoped = ctx([{ permission: 'branding.manage', scopeType: 'grade', scopeId: G5 }]);
    expect(can(scoped, 'branding.manage')).toBe(false);
    expect(hasAnywhere(scoped, 'branding.manage')).toBe(false);
  });

  it('"own" scope only covers records the user authored', () => {
    const c = ctx([{ permission: 'announcements.edit', scopeType: 'own' }]);
    expect(can(c, 'announcements.edit', { authorUserId: 'u1' })).toBe(true);
    expect(can(c, 'announcements.edit', { authorUserId: 'u2' })).toBe(false);
    expect(can(c, 'announcements.edit')).toBe(false);
  });

  it('Preschool Coordinator example: allowed preschool content, nothing else', () => {
    const coordinator = ctx(
      ['pages.edit', 'events.create', 'announcements.edit', 'resources.publish', 'dashboard.view'].map((permission) => ({
        permission,
        scopeType: 'audience' as const,
        scopeId: PK,
      })),
    );
    expect(can(coordinator, 'events.create', { audienceIds: [PK] })).toBe(true);
    expect(can(coordinator, 'resources.publish', { audienceIds: [PK] })).toBe(true);
    expect(can(coordinator, 'events.create', { audienceIds: ['other'] })).toBe(false);
    expect(can(coordinator, 'branding.manage')).toBe(false);
    expect(can(coordinator, 'users.remove')).toBe(false);
    expect(can(coordinator, 'billing.view')).toBe(false);
  });
});

describe('default roles', () => {
  it('owner holds every permission; admin lacks owner-only ones', () => {
    expect(getRoleTemplate('owner')!.permissions.sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    const admin = fromRole('school_admin');
    expect(can(admin, 'users.invite')).toBe(true);
    for (const p of ['domains.manage', 'security.manage', 'support.grant', 'integrations.manage']) {
      expect(can(admin, p)).toBe(false);
    }
  });

  it('content editor cannot publish; reviewer cannot change anything', () => {
    const editor = fromRole('content_editor');
    expect(can(editor, 'announcements.create')).toBe(true);
    expect(can(editor, 'announcements.publish')).toBe(false);
    const reviewer = fromRole('reviewer');
    expect(can(reviewer, 'events.view')).toBe(true);
    const writes = ALL_PERMISSION_KEYS.filter((k) => !k.endsWith('.view'));
    expect(writes.filter((p) => can(reviewer, p))).toEqual([]);
  });

  it('parent role has no administrative permissions', () => {
    expect(getRoleTemplate('parent')!.permissions).toEqual([]);
  });

  it('templates only reference known permissions, without duplicates', () => {
    for (const r of ROLE_TEMPLATES) {
      expect(r.permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p))).toEqual([]);
      expect(new Set(r.permissions).size).toBe(r.permissions.length);
    }
  });
});

describe('separation of duties', () => {
  it('authors cannot approve their own content when independent approval is on', () => {
    const comms = fromRole('communications_manager');
    expect(canApprove(comms, 'announcements', { authorUserId: 'u1' }, { independentApproval: true })).toBe(false);
    expect(canApprove(comms, 'announcements', { authorUserId: 'u2' }, { independentApproval: true })).toBe(true);
    expect(canApprove(comms, 'announcements', { authorUserId: 'u1' }, { independentApproval: false })).toBe(true);
    expect(canApprove(fromRole('content_editor'), 'announcements', { authorUserId: 'u2' }, { independentApproval: true })).toBe(false);
  });
});

describe('privilege escalation guards', () => {
  const role = (key: string, extra: Partial<{ isOwnerRole: boolean; isSystem: boolean }> = {}) => ({
    id: key,
    isSystem: true,
    isOwnerRole: !!getRoleTemplate(key)?.isOwnerRole,
    permissions: getRoleTemplate(key)!.permissions,
    ...extra,
  });

  it('only owners can grant the owner role', () => {
    expect(() =>
      assertCanAssignRole(fromRole('school_admin'), { role: role('owner'), targetUserId: 'u2', scopeType: 'school', scopeId: null }),
    ).toThrow(/Only the School Owner/);
    expect(() =>
      assertCanAssignRole(fromRole('owner'), { role: role('owner'), targetUserId: 'u2', scopeType: 'school', scopeId: null }),
    ).not.toThrow();
  });

  it('cannot grant permissions you do not hold', () => {
    const custom = ctx([{ permission: 'roles.assign' }, { permission: 'events.create' }]);
    expect(() =>
      assertCanAssignRole(custom, { role: role('communications_manager'), targetUserId: 'u2', scopeType: 'school', scopeId: null }),
    ).toThrow(/do not hold/);
  });

  it('non-owners cannot change their own roles', () => {
    expect(() =>
      assertCanAssignRole(fromRole('school_admin'), { role: role('content_editor'), targetUserId: 'u1', scopeType: 'school', scopeId: null }),
    ).toThrow(/your own roles/);
  });

  it('roles with school-wide permissions cannot be limited to a grade', () => {
    expect(() =>
      assertCanAssignRole(fromRole('owner'), { role: role('school_admin'), targetUserId: 'u2', scopeType: 'grade', scopeId: G5 }),
    ).toThrow(/cannot be limited/);
    expect(() =>
      assertCanAssignRole(fromRole('owner'), { role: role('teacher'), targetUserId: 'u2', scopeType: 'grade', scopeId: G5 }),
    ).not.toThrow();
  });

  it('keeps at least one owner', () => {
    expect(() =>
      assertCanRevokeRole(fromRole('owner'), { role: role('owner'), targetUserId: 'u2', remainingOwnerCount: 0 }),
    ).toThrow(/at least one owner/);
    expect(() =>
      assertCanRevokeRole(fromRole('school_admin'), { role: role('owner'), targetUserId: 'u2', remainingOwnerCount: 3 }),
    ).toThrow(/Only the School Owner/);
  });

  it('custom roles are capped by the editor permissions; system roles are locked', () => {
    const admin = fromRole('school_admin');
    expect(() => assertCanSetRolePermissions(admin, null, ['events.create', 'domains.manage'])).toThrow(/do not hold/);
    expect(() => assertCanSetRolePermissions(admin, null, ['events.create', 'nope.nope'])).toThrow(/Unknown/);
    expect(() => assertCanSetRolePermissions(admin, role('teacher'), ['events.create'])).toThrow(/Built-in/);
    expect(() => assertCanSetRolePermissions(admin, null, ['events.create', 'pages.edit'])).not.toThrow();
    expect(() => assertCanSetRolePermissions(fromRole('content_editor'), null, ['events.create'])).toThrow(/manage roles/);
  });
});
