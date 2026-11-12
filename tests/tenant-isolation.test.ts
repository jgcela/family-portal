// Cross-tenant isolation enforced by PostgreSQL row-level security.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import {
  auditLogs,
  memberships,
  roles,
  schoolProfiles,
  subscriptions,
  tenants,
  themeVersions,
  user,
} from '@/server/db/schema';
import { createSchool, createUser, expectDbError } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

beforeAll(async () => {
  a = await createSchool('alpha');
  b = await createSchool('beta');
});
afterAll(async () => {
  await closeDb();
});

describe('row-level security', () => {
  it('only returns the current tenant rows, even with no WHERE clause', async () => {
    const rows = await withTenant(a.tenant.id, (tx) => tx.select().from(schoolProfiles));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(a.tenant.id);

    const allRoles = await withTenant(a.tenant.id, (tx) => tx.select().from(roles));
    expect(allRoles.length).toBeGreaterThan(0);
    expect(allRoles.every((r) => r.tenantId === a.tenant.id)).toBe(true);
  });

  it('cannot read another tenant rows by id', async () => {
    const rows = await withTenant(a.tenant.id, (tx) =>
      tx.select().from(schoolProfiles).where(eq(schoolProfiles.tenantId, b.tenant.id)),
    );
    expect(rows).toHaveLength(0);
    const t = await withTenant(a.tenant.id, (tx) => tx.select().from(tenants));
    expect(t.map((x) => x.id)).toEqual([a.tenant.id]);
  });

  it('rejects inserts that claim another tenant id', async () => {
    await expectDbError(withTenant(a.tenant.id, (tx) =>
        tx.insert(themeVersions).values({ tenantId: b.tenant.id, status: 'archived', tokens: {} }),
      ), /row-level security/);
  });

  it('cannot update or delete another tenant rows', async () => {
    const updated = await withTenant(a.tenant.id, (tx) =>
      tx
        .update(schoolProfiles)
        .set({ displayName: 'hacked' })
        .where(eq(schoolProfiles.tenantId, b.tenant.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);
    const deleted = await withTenant(a.tenant.id, (tx) =>
      tx.delete(roles).where(eq(roles.tenantId, b.tenant.id)).returning(),
    );
    expect(deleted).toHaveLength(0);
    const [still] = await platformDb().select().from(schoolProfiles).where(eq(schoolProfiles.tenantId, b.tenant.id));
    expect(still!.displayName).toBe(`School beta`);
  });

  it('cannot move a row into another tenant', async () => {
    await expectDbError(
      withTenant(a.tenant.id, (tx) =>
        tx.update(schoolProfiles).set({ tenantId: b.tenant.id }).where(eq(schoolProfiles.tenantId, a.tenant.id)),
      ),
      /row-level security/,
    );
  });

  it('denies everything when no tenant is set (deny by default)', async () => {
    const rows = await platformDb().transaction(async (tx) => {
      await tx.execute(sql`set local role app_tenant`);
      return tx.select().from(schoolProfiles);
    });
    expect(rows).toHaveLength(0);
  });

  it('runs tenant work as the restricted app_tenant role', async () => {
    const who = await withTenant(a.tenant.id, (tx) => tx.execute(sql`select current_user as u`));
    expect((who.rows[0] as { u: string }).u).toBe('app_tenant');
    // The role and tenant are transaction-local: nothing leaks to the next query.
    const after = await platformDb().execute(sql`select current_user as u, current_setting('app.tenant_id', true) as t`);
    const row = after.rows[0] as { u: string; t: string | null };
    expect(row.u).not.toBe('app_tenant');
    expect(row.t ?? '').toBe('');
  });

  it('hides platform-only tables from the tenant role', async () => {
    await expectDbError(withTenant(a.tenant.id, (tx) => tx.execute(sql`select * from session`)), /permission denied/);
    await expectDbError(withTenant(a.tenant.id, (tx) => tx.execute(sql`select * from platform_admins`)), /permission denied/);
    await expectDbError(withTenant(a.tenant.id, (tx) => tx.execute(sql`select password from account`)), /permission denied/);
    await expectDbError(withTenant(a.tenant.id, (tx) => tx.update(subscriptions).set({ planId: 'test-all' })), /permission denied/);
  });

  it('only exposes users who are members of the current school', async () => {
    const outsider = await createUser('Outsider');
    const visible = await withTenant(a.tenant.id, (tx) => tx.select({ id: user.id }).from(user));
    const ids = visible.map((r) => r.id);
    expect(ids).toContain(a.ownerId);
    expect(ids).not.toContain(b.ownerId);
    expect(ids).not.toContain(outsider);
  });

  it('keeps audit logs per tenant and append-only', async () => {
    const logs = await withTenant(a.tenant.id, (tx) => tx.select().from(auditLogs));
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.tenantId === a.tenant.id)).toBe(true);
    await expectDbError(withTenant(a.tenant.id, (tx) => tx.delete(auditLogs)), /permission denied/);
  });

  it('every table with a tenant_id column has RLS enabled and a policy', async () => {
    const res = await platformDb().execute(sql`
      select c.relname as table, c.relrowsecurity as rls,
             (select count(*) from pg_policies p where p.tablename = c.relname)::int as policies
      from pg_class c
      join information_schema.columns col on col.table_name = c.relname and col.column_name = 'tenant_id'
      where c.relkind = 'r' and col.table_schema = 'public'`);
    const rows = res.rows as { table: string; rls: boolean; policies: number }[];
    expect(rows.length).toBeGreaterThan(10);
    const unprotected = rows.filter((r) => !r.rls || r.policies === 0).map((r) => r.table);
    expect(unprotected).toEqual([]);
  });

  it('rejects malformed tenant ids before touching the database', async () => {
    await expectDbError(withTenant("x'; drop table tenants; --", async () => 1), /invalid tenant id/);
  });

  it('enforces same-tenant references with composite foreign keys', async () => {
    // Try to give a school-A member a school-B role, even bypassing RLS as owner.
    const [bRole] = await platformDb().select().from(roles).where(eq(roles.tenantId, b.tenant.id)).limit(1);
    const [aMember] = await platformDb()
      .select()
      .from(memberships)
      .where(eq(memberships.tenantId, a.tenant.id))
      .limit(1);
    await expectDbError(platformDb().execute(
        sql`insert into membership_roles (tenant_id, membership_id, role_id) values (${a.tenant.id}, ${aMember!.id}, ${bRole!.id})`,
      ), /foreign key/);
  });
});
