// Syncs subscription plans from the catalog (marketing/src/config/site.ts).
// Runs on every production deploy after migrations. Safe to re-run.
import { closeDb } from '../src/server/db/client';
import { syncPlans } from '../src/server/billing/sync';

const r = await syncPlans();
console.log(`Plans synced: ${r.plans}; schools moved off retired plans: ${r.moved}.`);
await closeDb();
