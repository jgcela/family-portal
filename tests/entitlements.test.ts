// Plan limits, per-school overrides and metered usage.
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { rolePermissions, roles, subscriptions } from '@/server/db/schema';
import { syncPlans, syncSystemRoles } from '@/server/billing/sync';
import { consume, limitsFor, mergeLimits, QuotaExceededError, usageFor } from '@/server/billing/entitlements';
import { PLAN_CATALOG } from '@/server/billing/catalog';
import { createSchool } from './helpers';

afterAll(async () => {
  await closeDb();
});

describe('entitlements', () => {
  it('merges plan limits with overrides and ignores bad values', () => {
    const l = mergeLimits({ aiQuestionsPerMonth: 100, bogus: 5 }, { aiQuestionsPerMonth: 7, integrations: -1, supportLevel: 'priority' }, 10, null);
    expect(l.aiQuestionsPerMonth).toBe(7);
    expect(l.integrations).toBe(0);
    expect(l.supportLevel).toBe('priority');
    expect((l as Record<string, unknown>).bogus).toBeUndefined();
  });

  it('Essential has no AI, Smart has a monthly limit, Autonomous is unlimited; prices unchanged', () => {
    const by = Object.fromEntries(PLAN_CATALOG.map((p) => [p.id, p.limits]));
    expect(by.essential!.aiQuestionsPerMonth).toBe(0);
    expect(by.smart!.aiQuestionsPerMonth).toBeGreaterThan(0);
    expect(by.autonomous!.aiQuestionsPerMonth).toBeNull();
    expect(by.autonomous!.integrations).toBeGreaterThan(0);
    expect(PLAN_CATALOG.map((p) => p.priceCentsPerYear)).toEqual([499900, 899900, 1499900]);
    expect(PLAN_CATALOG.map((p) => p.implementationCents)).toEqual([100000, 200000, 400000]);
  });

  it('counts usage atomically and blocks at the limit without going over', async () => {
    await syncPlans();
    const s = await createSchool('quota');
    await platformDb().update(subscriptions).set({ planId: 'smart', status: 'active', limitOverrides: { aiQuestionsPerMonth: 3 } }).where(eq(subscriptions.tenantId, s.tenant.id));
    const now = new Date('2026-11-15T12:00:00Z');
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => withTenant(s.tenant.id, (tx) => consume(tx, s.tenant.id, 'aiQuestionsPerMonth', 1, now))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => r.reason instanceof QuotaExceededError)).toBe(true);
    const st = await withTenant(s.tenant.id, (tx) => usageFor(tx, s.tenant.id, 'aiQuestionsPerMonth', now));
    expect(st).toMatchObject({ used: 3, limit: 3, blocked: true, warn: true });
    // A new month starts again.
    const next = await withTenant(s.tenant.id, (tx) => usageFor(tx, s.tenant.id, 'aiQuestionsPerMonth', new Date('2026-12-01T00:00:00Z')));
    expect(next.used).toBe(0);
  });

  it('Autonomous has unlimited AI questions, with only the hidden safety cap', async () => {
    await syncPlans();
    const s = await createSchool('unlimited');
    await platformDb().update(subscriptions).set({ planId: 'autonomous', status: 'active' }).where(eq(subscriptions.tenantId, s.tenant.id));
    const now = new Date('2026-11-15T12:00:00Z');
    const prev = process.env.AI_MONTHLY_SAFETY_CAP;
    process.env.AI_MONTHLY_SAFETY_CAP = '2';
    try {
      const first = await withTenant(s.tenant.id, (tx) => consume(tx, s.tenant.id, 'aiQuestionsPerMonth', 1, now));
      expect(first).toMatchObject({ limit: null, warn: false, blocked: false });
      await withTenant(s.tenant.id, (tx) => consume(tx, s.tenant.id, 'aiQuestionsPerMonth', 1, now));
      await expect(withTenant(s.tenant.id, (tx) => consume(tx, s.tenant.id, 'aiQuestionsPerMonth', 1, now))).rejects.toThrow(/paused/);
    } finally {
      if (prev === undefined) delete process.env.AI_MONTHLY_SAFETY_CAP;
      else process.env.AI_MONTHLY_SAFETY_CAP = prev;
    }
  });

  it('a canceled school keeps its data but has no metered allowance', async () => {
    const s = await createSchool('canceled');
    await platformDb().update(subscriptions).set({ planId: 'autonomous', status: 'canceled' }).where(eq(subscriptions.tenantId, s.tenant.id));
    const l = await withTenant(s.tenant.id, (tx) => limitsFor(tx, s.tenant.id));
    expect(l.aiQuestionsPerMonth).toBe(0);
    await expect(withTenant(s.tenant.id, (tx) => consume(tx, s.tenant.id, 'aiQuestionsPerMonth'))).rejects.toThrow(/not included/);
  });

  it('adds new built-in permissions and roles to existing schools, without touching custom roles', async () => {
    const s = await createSchool('rolesync');
    const [admin] = await platformDb().select().from(roles).where(eq(roles.tenantId, s.tenant.id)).then((r) => r.filter((x) => x.key === 'school_admin'));
    await platformDb().delete(rolePermissions).where(eq(rolePermissions.roleId, admin!.id));
    await platformDb().delete(roles).where(eq(roles.id, (await platformDb().select().from(roles).where(eq(roles.tenantId, s.tenant.id))).find((r) => r.key === 'attendance_staff')!.id));
    await syncSystemRoles();
    const after = await platformDb().select().from(roles).where(eq(roles.tenantId, s.tenant.id));
    expect(after.some((r) => r.key === 'attendance_staff' && r.isSystem)).toBe(true);
    const perms = await platformDb().select().from(rolePermissions).where(eq(rolePermissions.roleId, admin!.id));
    expect(perms.map((p) => p.permission)).toContain('ai.knowledge.manage');
    expect(perms.map((p) => p.permission)).not.toContain('ai.conversations.review');
  });
});
