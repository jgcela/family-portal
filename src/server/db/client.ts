import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const globalForDb = globalThis as unknown as { __fpPool?: Pool; __fpDb?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is missing. See .env.example.');
  const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) });
  globalForDb.__fpPool = pool;
  return drizzle(pool, { schema });
}

/**
 * Owner-level connection. Bypasses row-level security, so it is ONLY for
 * platform operations (tenant resolution, auth, super admin, migrations,
 * seeding). Code acting for a school must use withTenant().
 */
export function platformDb(): Db {
  if (!globalForDb.__fpDb) globalForDb.__fpDb = createDb();
  return globalForDb.__fpDb;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs fn in a transaction that the database itself confines to one tenant:
 * the role switches to app_tenant (subject to RLS) and app.tenant_id is set
 * for this transaction only. Any query for another tenant's rows returns
 * nothing, and writes with a different tenant_id are rejected.
 *
 * tenantId must come from server-side resolution (host/domain lookup), never
 * from request input.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>, db: Db = platformDb()): Promise<T> {
  if (!UUID_RE.test(tenantId)) throw new Error('withTenant: invalid tenant id');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`set local role app_tenant`);
    return fn(tx);
  });
}

export async function closeDb() {
  await globalForDb.__fpPool?.end();
  globalForDb.__fpPool = undefined;
  globalForDb.__fpDb = undefined;
}
