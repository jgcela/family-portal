// Plans follow the marketing site; syncing moves schools off retired plans without losing modules.
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb } from '@/server/db/client';
import { plans, subscriptions } from '@/server/db/schema';
import { PLAN_CATALOG, FEATURE_MODULES } from '@/server/billing/catalog';
import { syncPlans } from '@/server/billing/sync';
import { getModuleState } from '@/server/services/modules';
import { MODULES } from '@/server/modules/registry';
import { plans as marketingPlans } from '../marketing/src/config/site';
import { createSchool } from './helpers';

afterAll(async () => {
  await closeDb();
});

describe('plan catalog', () => {
  it('matches the marketing site names, order and prices, and each plan includes the previous one', () => {
    expect(PLAN_CATALOG.map((p) => p.name)).toEqual(marketingPlans.map((p) => p.name));
    expect(PLAN_CATALOG.map((p) => p.priceCentsPerYear)).toEqual(marketingPlans.map((p) => p.annual * 100));
    for (let i = 1; i < PLAN_CATALOG.length; i++) {
      for (const m of PLAN_CATALOG[i - 1]!.includedModules) expect(PLAN_CATALOG[i]!.includedModules).toContain(m);
    }
    // Every mapped module exists in the registry.
    for (const ids of Object.values(FEATURE_MODULES)) for (const id of ids) expect(MODULES.some((m) => m.id === id)).toBe(true);
    // Everything that works today is sold in some plan, and the highest plan has it all.
    const live = MODULES.filter((m) => m.implemented && !m.required).map((m) => m.id);
    for (const id of live) expect(PLAN_CATALOG[PLAN_CATALOG.length - 1]!.includedModules).toContain(id);
    // AI is not part of Essential.
    expect(PLAN_CATALOG[0]!.includedModules).not.toContain('knowledge_ai');
    expect(PLAN_CATALOG[1]!.includedModules).toContain('knowledge_ai');
  });

  it('sync writes the plans and moves schools from retired plans', async () => {
    await platformDb()
      .insert(plans)
      .values({ id: 'complete', name: 'Complete', includedModules: MODULES.map((m) => m.id), storageLimitMb: 10 })
      .onConflictDoNothing();
    const s = await createSchool('plans', { planId: 'complete', enabledModules: ['calendar', 'documents'] });
    await syncPlans();
    await syncPlans(); // idempotent
    const [sub] = await platformDb().select().from(subscriptions).where(eq(subscriptions.tenantId, s.tenant.id));
    expect(sub!.planId).toBe('autonomous');
    const [old] = await platformDb().select().from(plans).where(eq(plans.id, 'complete'));
    expect(old!.isActive).toBe(false);
    const state = await getModuleState(s.tenant.id);
    expect(state.active.map((m) => m.id)).toEqual(expect.arrayContaining(['calendar', 'documents']));
  });
});
