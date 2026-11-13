// Custom domains: only owners add them, DNS proves control, and only verified domains resolve.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { membershipRoles, memberships, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { addDomain, listDomains, removeDomain, setPrimaryDomain, txtRecordName, txtRecordValue, validateHostname, verifyDomain } from '@/server/services/domains';
import { findTenantByKey } from '@/server/tenancy/tenants';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;
const host = () => `portal-${randomUUID().slice(0, 8)}.example-school.org`;

beforeAll(async () => {
  a = await createSchool('dom-a');
  b = await createSchool('dom-b');
});
afterAll(async () => {
  await closeDb();
});

describe('custom domains', () => {
  it('validates hostnames', () => {
    expect(validateHostname('https://Portal.StMary.org/home')).toBe('portal.stmary.org');
    expect(() => validateHostname('not a domain')).toThrow(/Enter a domain/);
    expect(() => validateHostname('x.vercel.app')).toThrow(/school owns/);
    expect(() => validateHostname('localhost')).toThrow();
  });

  it('a domain resolves only after its TXT record matches', async () => {
    const h = host();
    const d = await addDomain(a.ownerCtx, h);
    expect(d.verifiedAt).toBeNull();
    expect(await findTenantByKey(h)).toBeNull();
    await expect(addDomain(b.ownerCtx, h)).rejects.toThrow(/another portal/);
    await expect(addDomain(a.ownerCtx, h.toUpperCase())).rejects.toThrow(/already on your list/);

    // Wrong or missing record: still unverified.
    const wrong = await verifyDomain(a.ownerCtx, d.id, undefined, async () => [['fp-verify=nope']]);
    expect(wrong.verified).toBe(false);
    const failing = await verifyDomain(a.ownerCtx, d.id, undefined, async () => {
      throw new Error('ENOTFOUND');
    });
    expect(failing.verified).toBe(false);
    await expect(setPrimaryDomain(a.ownerCtx, d.id)).rejects.toThrow(/Verify the domain/);

    // Another school cannot verify or remove it.
    await expect(verifyDomain(b.ownerCtx, d.id, undefined, async () => [[txtRecordValue(d.verificationToken!)]])).rejects.toThrow(/not found/);
    await expect(removeDomain(b.ownerCtx, d.id)).rejects.toThrow(/not found/);

    let asked = '';
    const ok = await verifyDomain(a.ownerCtx, d.id, undefined, async (name) => {
      asked = name;
      // TXT values can arrive split into chunks.
      const v = txtRecordValue(d.verificationToken!);
      return [['unrelated'], [v.slice(0, 5), v.slice(5)]];
    });
    expect(asked).toBe(txtRecordName(h));
    expect(ok.verified).toBe(true);
    expect((await findTenantByKey(h))?.id).toBe(a.tenant.id);
    await setPrimaryDomain(a.ownerCtx, d.id);
    expect((await listDomains(a.tenant.id)).find((x) => x.id === d.id)?.isPrimary).toBe(true);

    await removeDomain(a.ownerCtx, d.id);
    expect(await findTenantByKey(h)).toBeNull();
  });

  it('only the School Owner manages domains, and there is a limit', async () => {
    const userId = await createUser('Admin');
    await withTenant(b.tenant.id, async (tx) => {
      const [m] = await tx.insert(memberships).values({ tenantId: b.tenant.id, userId, kind: 'staff', status: 'active' }).returning();
      const [r] = await tx.select().from(roles).where(eq(roles.key, 'school_admin'));
      await tx.insert(membershipRoles).values({ tenantId: b.tenant.id, membershipId: m!.id, roleId: r!.id, scopeType: 'school' });
    });
    const admin = (await loadAuthzContext(b.tenant.id, userId))!;
    await expect(addDomain(admin, host())).rejects.toThrow(/School Owner/);
    for (let i = 0; i < 3; i++) await addDomain(b.ownerCtx, host());
    await expect(addDomain(b.ownerCtx, host())).rejects.toThrow(/up to 3/);
  });
});
