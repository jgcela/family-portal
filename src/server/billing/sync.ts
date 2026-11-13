// Writes the plan catalog into the plans table and moves schools off retired plans.
import { eq, inArray } from 'drizzle-orm';
import { platformDb, type Db } from '../db/client';
import { plans, subscriptions } from '../db/schema';
import { PLAN_CATALOG, RETIRED_PLANS } from './catalog';

export async function syncPlans(db: Db = platformDb()) {
  return db.transaction(async (tx) => {
    for (const p of PLAN_CATALOG) {
      const row = {
        name: p.name,
        description: p.description,
        includedModules: p.includedModules,
        storageLimitMb: p.storageLimitMb,
        staffUserLimit: p.staffUserLimit,
        priceCentsPerYear: p.priceCentsPerYear,
        isActive: true,
      };
      await tx.insert(plans).values({ id: p.id, ...row }).onConflictDoUpdate({ target: plans.id, set: row });
    }
    let moved = 0;
    for (const [from, to] of Object.entries(RETIRED_PLANS)) {
      const r = await tx.update(subscriptions).set({ planId: to, updatedAt: new Date() }).where(eq(subscriptions.planId, from)).returning({ id: subscriptions.id });
      moved += r.length;
    }
    const retired = Object.keys(RETIRED_PLANS);
    if (retired.length) await tx.update(plans).set({ isActive: false }).where(inArray(plans.id, retired));
    return { plans: PLAN_CATALOG.length, moved };
  });
}
