// Backend authorization paths, end to end against PostgreSQL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { auditLogs, grades, membershipRoles, memberships, roles, tenantModules, themeVersions } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { assignRole, createCustomRole, revokeRole } from '@/server/services/people';
import { setModuleEnabled } from '@/server/services/modules';
import { getPublishedTheme, publishThemeDraft, saveThemeDraft } from '@/server/services/theme';
import { DEFAULT_THEME } from '@/server/theme/tokens';
import { ST_MARY_THEME } from '@/server/tenancy/st-mary';
import { MODULES } from '@/server/modules/registry';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

async function addMember(tenantId: string, roleKey: string | null, scope?: { scopeType: 'grade'; scopeId: string }) {
  const userId = await createUser(`member-${roleKey}`);
  const membershipId = await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    if (roleKey) {
      const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
      await tx.insert(membershipRoles).values({
        tenantId,
        membershipId: m!.id,
        roleId: r!.id,
        scopeType: scope?.scopeType ?? 'school',
        scopeId: scope?.scopeId ?? null,
      });
    }
    return m!.id;
  });
  return { userId, membershipId, ctx: (await loadAuthzContext(tenantId, userId))! };
}

async function roleId(tenantId: string, key: string) {
  return withTenant(tenantId, async (tx) => (await tx.select().from(roles).where(eq(roles.key, key)))[0]!.id);
}

beforeAll(async () => {
  a = await createSchool('svc-a', { theme: ST_MARY_THEME });
  b = await createSchool('svc-b');
});
afterAll(async () => {
  await closeDb();
});

describe('provisioning', () => {
  it('creates roles, audiences, grades, modules and an owner', async () => {
    expect(a.ownerCtx.grants.some((g) => g.isOwnerRole)).toBe(true);
    const rows = await withTenant(a.tenant.id, (tx) => tx.select().from(tenantModules));
    expect(rows).toHaveLength(MODULES.length);
    expect(rows.find((r) => r.moduleId === 'home')!.enabled).toBe(true);
    const gradeRows = await withTenant(a.tenant.id, (tx) => tx.select().from(grades));
    expect(gradeRows.map((g) => g.code)).toEqual(['PK3', 'PK4', 'K', '1', '2', '3', '4', '5', '6', '7', '8']);
    expect((await getPublishedTheme(a.tenant.id)).colors.primary).toBe('#16335B');
  });

  it('users have no context in schools they do not belong to', async () => {
    expect(await loadAuthzContext(b.tenant.id, a.ownerId)).toBeNull();
  });
});

describe('role assignment', () => {
  it('owner assigns a grade-scoped teacher role', async () => {
    const t = await addMember(a.tenant.id, null);
    const [g5] = await withTenant(a.tenant.id, (tx) => tx.select().from(grades).where(eq(grades.code, '5')));
    await assignRole(a.ownerCtx, {
      membershipId: t.membershipId,
      roleId: await roleId(a.tenant.id, 'teacher'),
      scopeType: 'grade',
      scopeId: g5!.id,
    });
    const ctx = (await loadAuthzContext(a.tenant.id, t.userId))!;
    expect(ctx.grants.every((g) => g.scopeType === 'grade' && g.scopeId === g5!.id)).toBe(true);
    const log = await withTenant(a.tenant.id, (tx) =>
      tx.select().from(auditLogs).where(and(eq(auditLogs.action, 'role.assigned'), eq(auditLogs.targetId, t.membershipId))),
    );
    expect(log).toHaveLength(1);
  });

  it('an administrator cannot make anyone an owner, including themselves', async () => {
    const admin = await addMember(a.tenant.id, 'school_admin');
    const other = await addMember(a.tenant.id, null);
    const owner = await roleId(a.tenant.id, 'owner');
    await expect(
      assignRole(admin.ctx, { membershipId: other.membershipId, roleId: owner, scopeType: 'school', scopeId: null }),
    ).rejects.toThrow(/Only the School Owner/);
    await expect(
      assignRole(admin.ctx, { membershipId: admin.membershipId, roleId: owner, scopeType: 'school', scopeId: null }),
    ).rejects.toThrow();
  });

  it('cannot assign roles to members of another school, or use another school role', async () => {
    const bMember = await addMember(b.tenant.id, null);
    await expect(
      assignRole(a.ownerCtx, {
        membershipId: bMember.membershipId,
        roleId: await roleId(a.tenant.id, 'teacher'),
        scopeType: 'school',
        scopeId: null,
      }),
    ).rejects.toThrow(/Member not found/);
    const aMember = await addMember(a.tenant.id, null);
    await expect(
      assignRole(a.ownerCtx, {
        membershipId: aMember.membershipId,
        roleId: await roleId(b.tenant.id, 'teacher'),
        scopeType: 'school',
        scopeId: null,
      }),
    ).rejects.toThrow(/Role not found/);
  });

  it('the last owner role cannot be removed', async () => {
    const [mr] = await withTenant(a.tenant.id, (tx) =>
      tx
        .select({ id: membershipRoles.id })
        .from(membershipRoles)
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .where(eq(roles.isOwnerRole, true)),
    );
    await expect(revokeRole(a.ownerCtx, mr!.id)).rejects.toThrow(/at least one owner/);
  });

  it('custom roles: Preschool Coordinator cannot exceed its creator', async () => {
    const admin = await addMember(a.tenant.id, 'school_admin');
    const role = await createCustomRole(admin.ctx, {
      key: 'preschool_coordinator',
      name: 'Preschool Coordinator',
      permissions: ['dashboard.view', 'events.create', 'announcements.edit', 'resources.publish', 'pages.edit'],
    });
    expect(role.isSystem).toBe(false);
    await expect(
      createCustomRole(admin.ctx, { key: 'sneaky', name: 'Sneaky', permissions: ['support.grant'] }),
    ).rejects.toThrow(/do not hold/);
  });
});

describe('modules', () => {
  it('a content editor cannot toggle modules', async () => {
    const editor = await addMember(a.tenant.id, 'content_editor');
    await expect(setModuleEnabled(editor.ctx, 'calendar', true)).rejects.toThrow(/Not allowed/);
  });

  it('refuses modules that are not implemented yet, and keeps data when disabling', async () => {
    await expect(setModuleEnabled(a.ownerCtx, 'attendance', true)).rejects.toThrow(/not available yet/);
    await expect(setModuleEnabled(a.ownerCtx, 'home', false)).rejects.toThrow(/cannot be disabled/);
  });
});

describe('theme publishing', () => {
  it('saves a draft, blocks inaccessible themes, publishes and archives the old version', async () => {
    const bad = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, text: '#F5F5F5' } };
    await saveThemeDraft(a.ownerCtx, bad);
    await expect(publishThemeDraft(a.ownerCtx)).rejects.toThrow(/contrast/);

    const good = { ...ST_MARY_THEME, radius: 'round' as const };
    await saveThemeDraft(a.ownerCtx, good);
    await publishThemeDraft(a.ownerCtx);
    expect((await getPublishedTheme(a.tenant.id)).radius).toBe('round');

    const versions = await withTenant(a.tenant.id, (tx) => tx.select().from(themeVersions));
    expect(versions.filter((v) => v.status === 'published')).toHaveLength(1);
    expect(versions.filter((v) => v.status === 'archived').length).toBeGreaterThanOrEqual(1);
    // School B's theme is untouched.
    expect((await getPublishedTheme(b.tenant.id)).colors.primary).toBe(DEFAULT_THEME.colors.primary);
  });

  it('teachers cannot change branding', async () => {
    const teacher = await addMember(a.tenant.id, 'teacher');
    await expect(saveThemeDraft(teacher.ctx, ST_MARY_THEME)).rejects.toThrow(/Not allowed/);
  });

  it('a forged or copied context is rejected (tenant id cannot be swapped)', async () => {
    const forged = { ...a.ownerCtx, tenantId: b.tenant.id };
    await expect(saveThemeDraft(forged, ST_MARY_THEME)).rejects.toThrow(/Unverified/);
    await expect(setModuleEnabled({ ...a.ownerCtx }, 'calendar', true)).rejects.toThrow(/Unverified/);
    expect(() => {
      (a.ownerCtx as { tenantId: string }).tenantId = b.tenant.id;
    }).toThrow();
    expect(await loadAuthzContext(b.tenant.id, a.ownerId)).toBeNull();
  });
});
