import { randomUUID } from 'node:crypto';
import { platformDb } from '@/server/db/client';
import { plans, user } from '@/server/db/schema';
import { provisionTenant, type ProvisionInput } from '@/server/tenancy/provision';
import { loadAuthzContext } from '@/server/rbac/context';
import { MODULES } from '@/server/modules/registry';

export async function ensurePlans() {
  await platformDb()
    .insert(plans)
    .values([
      { id: 'test-all', name: 'All modules', includedModules: MODULES.map((m) => m.id), storageLimitMb: 1000 },
      { id: 'test-basic', name: 'Basic', includedModules: ['home'], storageLimitMb: 100 },
    ])
    .onConflictDoNothing();
}

export async function createUser(name = 'Test User') {
  const id = randomUUID();
  await platformDb()
    .insert(user)
    .values({ id, name, email: `${id}@example.test`, emailVerified: true });
  return id;
}

export async function createSchool(slug: string, extra: Partial<ProvisionInput> = {}) {
  await ensurePlans();
  const ownerId = await createUser(`Owner of ${slug}`);
  const tenant = await provisionTenant({
    slug: `${slug}-${randomUUID().slice(0, 6)}`,
    name: `School ${slug}`,
    planId: 'test-all',
    status: 'active',
    ownerUserId: ownerId,
    ...extra,
  });
  const ownerCtx = (await loadAuthzContext(tenant.id, ownerId))!;
  return { tenant, ownerId, ownerCtx };
}

/** Drizzle wraps driver errors; this asserts on the underlying PostgreSQL message. */
export async function expectDbError(p: Promise<unknown>, re: RegExp) {
  try {
    await p;
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    const msg = `${e.message ?? ''} ${e.cause?.message ?? ''}`;
    if (!re.test(msg)) throw new Error(`Expected DB error ${re}, got: ${msg}`);
    return;
  }
  throw new Error(`Expected DB error ${re}, but the query succeeded`);
}
