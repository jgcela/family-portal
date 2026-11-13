// Super Admin: creating schools, first administrator, status and subscriptions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { academicYears, grades, platformAdmins, schoolProfiles, subscriptions, tenantModules, tenants, user } from '@/server/db/schema';
import {
  changeSchoolStatus,
  createSchool,
  getSchool,
  issueOwnerInvitation,
  listSchools,
  loadPlatformContext,
  platformCan,
  updateSubscription,
  type PlatformContext,
} from '@/server/services/platform';
import { acceptInvitation } from '@/server/services/staff';
import { requestToJoin, setJoinCode } from '@/server/services/families';
import { loadAuthzContext } from '@/server/rbac/context';
import { getModuleState } from '@/server/services/modules';
import { loadViewer } from '@/server/viewer';
import { createUser, ensurePlans } from './helpers';

let owner: PlatformContext;
let operator: PlatformContext;
let support: PlatformContext;

async function platformUser(role: 'owner' | 'operator' | 'support') {
  const id = await createUser(`Platform ${role}`);
  await platformDb().insert(platformAdmins).values({ userId: id, role });
  return (await loadPlatformContext(id))!;
}

const base = (slug: string, email: string) => ({
  name: 'Holy Family Academy',
  shortName: 'Holy Family',
  slug,
  timezone: 'America/Chicago',
  phone: '555-0100',
  email: 'office@example.test',
  website: '',
  primaryColor: '#123456',
  accentColor: '#F2B705',
  yearLabel: '2026-27',
  yearStart: '2026-08-15',
  yearEnd: '2027-05-30',
  gradeStructure: 'k-8',
  excludeGrades: ['8'],
  adminName: 'Pat Principal',
  adminEmail: email,
  planId: 'test-basic',
  subscriptionStatus: 'trialing',
  trialDays: 14,
  modules: [],
});

beforeAll(async () => {
  await ensurePlans();
  owner = await platformUser('owner');
  operator = await platformUser('operator');
  support = await platformUser('support');
});
afterAll(async () => {
  await closeDb();
});

describe('platform access', () => {
  it('only platform admins get a context, and roles limit what they can do', async () => {
    expect(await loadPlatformContext(await createUser('Nobody'))).toBeNull();
    expect(platformCan(owner, 'schools.manage')).toBe(true);
    expect(platformCan(operator, 'schools.manage')).toBe(true);
    expect(platformCan(support, 'schools.manage')).toBe(false);
    expect(platformCan(support, 'schools.view')).toBe(true);
    // A copied context is not trusted.
    expect(platformCan({ ...owner }, 'schools.view')).toBe(false);
    await expect(listSchools({ ...owner })).rejects.toThrow(/Unverified/);
    await expect(createSchool(support, base(`s-${randomUUID().slice(0, 8)}`, 'x@example.test'))).rejects.toThrow(/schools.manage/);
  });
});

describe('creating a school', () => {
  it('provisions the school, its first owner invitation, and nothing is live until launch', async () => {
    const slug = `hfa-${randomUUID().slice(0, 8)}`;
    const adminId = await createUser('Pat Principal');
    const [adminUser] = await platformDb().select().from(user).where(eq(user.id, adminId));
    const { tenant, token } = await createSchool(operator, base(slug, adminUser!.email));
    expect(tenant.status).toBe('onboarding');
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    const [sub] = await platformDb().select().from(subscriptions).where(eq(subscriptions.tenantId, tenant.id));
    expect(sub!.status).toBe('trialing');
    expect(sub!.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 86400_000);

    await withTenant(tenant.id, async (tx) => {
      const g = await tx.select().from(grades);
      expect(g.map((x) => x.code)).toEqual(['K', '1', '2', '3', '4', '5', '6', '7']);
      const [y] = await tx.select().from(academicYears);
      expect(y!.label).toBe('2026-27');
      const [p] = await tx.select().from(schoolProfiles);
      expect(p!.shortName).toBe('Holy Family');
    });

    // Launch needs an administrator who has accepted.
    await expect(changeSchoolStatus(operator, tenant.id, 'launch')).rejects.toThrow(/accepted the invitation/);
    const m = await acceptInvitation(tenant.id, token, adminId);
    const ctx = (await loadAuthzContext(tenant.id, adminId))!;
    expect(ctx.membershipId).toBe(m.id);
    expect(ctx.grants.some((g) => g.isOwnerRole)).toBe(true);
    await changeSchoolStatus(operator, tenant.id, 'launch');
    const [t] = await platformDb().select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(t!.status).toBe('active');

    const detail = (await getSchool(support, tenant.id))!;
    expect(detail.owners.map((o) => o.email)).toEqual([adminUser!.email]);
    expect(detail.activity.map((a) => a.action)).toEqual(expect.arrayContaining(['tenant.provisioned', 'platform.owner_invited', 'platform.school_launched']));
    expect((await listSchools(support)).some((s) => s.id === tenant.id && s.staff === 1)).toBe(true);
  });

  it('rejects taken or reserved addresses, invalid colours and modules outside the plan', async () => {
    const slug = `dup-${randomUUID().slice(0, 8)}`;
    await createSchool(owner, base(slug, `${randomUUID()}@example.test`));
    await expect(createSchool(owner, base(slug, 'a@example.test'))).rejects.toThrow(/already used/);
    await expect(createSchool(owner, base('admin', 'a@example.test'))).rejects.toThrow(/reserved/);
    await expect(createSchool(owner, { ...base(`c-${randomUUID().slice(0, 8)}`, 'a@example.test'), primaryColor: 'navy' })).rejects.toThrow(/6-digit colour/);
    await expect(createSchool(owner, { ...base(`m-${randomUUID().slice(0, 8)}`, 'a@example.test'), modules: ['calendar'] })).rejects.toThrow(/not available on this plan/);
    await expect(createSchool(owner, { ...base(`y-${randomUUID().slice(0, 8)}`, 'a@example.test'), yearEnd: '2026-01-01' })).rejects.toThrow(/end after/);
    await expect(createSchool(owner, { ...base(`z-${randomUUID().slice(0, 8)}`, 'a@example.test'), timezone: 'Mars/Base' })).rejects.toThrow(/time zone/);
  });
});

describe('running a school', () => {
  it('suspension closes the dashboard, sign-ups and family access; reactivation restores them', async () => {
    const adminId = await createUser('Admin');
    const [u] = await platformDb().select().from(user).where(eq(user.id, adminId));
    const { tenant, token } = await createSchool(owner, { ...base(`sus-${randomUUID().slice(0, 8)}`, u!.email), planId: 'test-all', modules: ['calendar'] });
    await acceptInvitation(tenant.id, token, adminId);
    await changeSchoolStatus(owner, tenant.id, 'launch');
    const ctx = (await loadAuthzContext(tenant.id, adminId))!;
    const code = (await setJoinCode(ctx, true))!;

    await expect(changeSchoolStatus(owner, tenant.id, 'suspend', '')).rejects.toThrow(/reason/);
    await expect(changeSchoolStatus(support, tenant.id, 'suspend', 'Unpaid')).rejects.toThrow(/schools.manage/);
    await changeSchoolStatus(owner, tenant.id, 'suspend', 'Unpaid invoice');
    expect(await loadAuthzContext(tenant.id, adminId)).toBeNull();
    expect((await loadViewer(tenant.id, adminId)).kind).toBe('public');
    const g = await withTenant(tenant.id, async (tx) => (await tx.select().from(grades))[0]!.id);
    await expect(requestToJoin(tenant.id, await createUser('P'), { code, gradeIds: [g], note: 'x' })).rejects.toThrow(/not available/);
    await expect(changeSchoolStatus(owner, tenant.id, 'launch')).rejects.toThrow(/cannot be changed/);

    await changeSchoolStatus(owner, tenant.id, 'reactivate');
    expect(await loadAuthzContext(tenant.id, adminId)).not.toBeNull();
  });

  it('plan changes switch modules off without deleting data, and are logged', async () => {
    const { tenant } = await createSchool(owner, { ...base(`plan-${randomUUID().slice(0, 8)}`, `${randomUUID()}@example.test`), planId: 'test-all', modules: ['calendar', 'documents'] });
    let state = await getModuleState(tenant.id);
    expect(state.active.map((m) => m.id)).toEqual(expect.arrayContaining(['calendar', 'documents']));

    await updateSubscription(owner, tenant.id, { planId: 'test-basic', status: 'active', extraModules: ['documents'] });
    state = await getModuleState(tenant.id);
    expect(state.active.map((m) => m.id)).toContain('documents');
    expect(state.active.map((m) => m.id)).not.toContain('calendar');
    // The calendar row is still there, just not active.
    const rows = await withTenant(tenant.id, (tx) => tx.select().from(tenantModules).where(eq(tenantModules.moduleId, 'calendar')));
    expect(rows[0]!.enabled).toBe(true);

    await expect(updateSubscription(owner, tenant.id, { planId: 'test-basic', status: 'trialing' })).rejects.toThrow(/end date/);
    await expect(updateSubscription(owner, tenant.id, { planId: 'nope', status: 'active' })).rejects.toThrow(/plan/);
    await expect(updateSubscription(support, tenant.id, { planId: 'test-basic', status: 'active' })).rejects.toThrow(/subscriptions.manage/);
    const detail = (await getSchool(owner, tenant.id))!;
    expect(detail.activity.some((a) => a.action === 'platform.subscription_changed')).toBe(true);
  });

  it('recovery invitations replace the earlier one and refuse existing members', async () => {
    const adminId = await createUser('Admin');
    const [u] = await platformDb().select().from(user).where(eq(user.id, adminId));
    const { tenant, token } = await createSchool(owner, base(`rec-${randomUUID().slice(0, 8)}`, u!.email));
    const again = await issueOwnerInvitation(owner, tenant.id, { name: 'Admin', email: u!.email });
    // The first link stopped working when the second was issued.
    await expect(acceptInvitation(tenant.id, token, adminId)).rejects.toThrow(/no longer valid/);
    await acceptInvitation(tenant.id, again, adminId);
    await expect(issueOwnerInvitation(owner, tenant.id, { name: 'Admin', email: u!.email })).rejects.toThrow(/already belongs/);
    expect((await getSchool(owner, tenant.id))!.ownerInvites).toHaveLength(0);
  });
});
