// Seeds plans and the St. Mary tenant. Safe to re-run (skips what exists).
// Optional: SEED_OWNER_EMAIL + SEED_OWNER_PASSWORD create the first account,
// make it St. Mary's School Owner and a platform owner.
// Usage: npm run db:seed
import { eq } from 'drizzle-orm';
import { auth } from '../src/server/auth/auth';
import { closeDb, platformDb } from '../src/server/db/client';
import { platformAdmins, tenants, user } from '../src/server/db/schema';
import { syncPlans } from '../src/server/billing/sync';
import { provisionTenant } from '../src/server/tenancy/provision';
import { ST_MARY } from '../src/server/tenancy/st-mary';


async function ensureOwnerAccount(): Promise<string | undefined> {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) return undefined;
  if (password.length < 12) throw new Error('SEED_OWNER_PASSWORD must be at least 12 characters.');
  const db = platformDb();
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) return existing.id;
  const ctx = await auth().$context;
  const created = await ctx.internalAdapter.createUser({
    email,
    name: process.env.SEED_OWNER_NAME ?? 'Platform Owner',
    emailVerified: true,
  }, { method: 'admin' });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await ctx.password.hash(password),
  });
  console.log(`Created account ${email}`);
  return created.id;
}

async function main() {
  const db = platformDb();
  // Plans come from the catalog (marketing/src/config/site.ts).
  await syncPlans(db);

  const ownerId = await ensureOwnerAccount();
  if (ownerId) await db.insert(platformAdmins).values({ userId: ownerId, role: 'owner' }).onConflictDoNothing();

  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, ST_MARY.slug));
  if (existing) {
    console.log('St. Mary already exists; skipping.');
  } else {
    const root = process.env.PLATFORM_ROOT_DOMAIN;
    await provisionTenant({
      ...ST_MARY,
      planId: 'autonomous',
      ownerUserId: ownerId,
      subdomainHost: root && root !== 'localhost' ? `${ST_MARY.slug}.${root}` : undefined,
    });
    console.log('Created tenant St. Mary Catholic Virtue School (slug: stmary).');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
