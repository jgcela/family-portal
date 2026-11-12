// Tenant lookup (platform-level, owner connection) and request context.
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { platformDb, type Db } from '../db/client';
import { tenantDomains, tenants } from '../db/schema';
import { isValidSlug } from './resolve';

export type TenantRecord = typeof tenants.$inferSelect;

/**
 * Resolves the route key used under /s/[tenant]: either a slug (subdomain or
 * path mode) or a verified custom hostname (rewritten by the proxy).
 */
export async function findTenantByKey(key: string, db: Db = platformDb()): Promise<TenantRecord | null> {
  const k = key.toLowerCase();
  if (k.includes('.')) {
    const rows = await db
      .select({ t: tenants })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
      .where(and(sql`lower(${tenantDomains.hostname}) = ${k}`, isNotNull(tenantDomains.verifiedAt)))
      .limit(1);
    return rows[0]?.t ?? null;
  }
  if (!isValidSlug(k)) return null;
  const rows = await db.select().from(tenants).where(eq(tenants.slug, k)).limit(1);
  return rows[0] ?? null;
}

/** Whether a tenant's portal may be served to visitors. */
export function isServable(t: TenantRecord): boolean {
  return t.status === 'active' || t.status === 'onboarding';
}
