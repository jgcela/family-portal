// "School login" finder: exact matches only, closed schools never found.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb } from '@/server/db/client';
import { tenantDomains, tenants } from '@/server/db/schema';
import { adminPath, findSchool, parseSchoolQuery } from '@/server/tenancy/find-school';
import { createSchool } from './helpers';

let open: Awaited<ReturnType<typeof createSchool>>;
let closed: Awaited<ReturnType<typeof createSchool>>;

beforeAll(async () => {
  open = await createSchool('find');
  closed = await createSchool('gone');
  await platformDb().update(tenants).set({ name: 'Saint Finder Academy' }).where(eq(tenants.id, open.tenant.id));
  await platformDb().update(tenants).set({ status: 'suspended' }).where(eq(tenants.id, closed.tenant.id));
});
afterAll(async () => {
  await closeDb();
});

describe('parseSchoolQuery', () => {
  it('reads codes, addresses and names', () => {
    expect(parseSchoolQuery('  StMary ', 'famitenly.com')).toEqual({ kind: 'slug', slug: 'stmary' });
    expect(parseSchoolQuery('https://family-portal-brown.vercel.app/s/stmary/admin', 'localhost')).toEqual({ kind: 'slug', slug: 'stmary' });
    expect(parseSchoolQuery('stmary.famitenly.com', 'famitenly.com')).toEqual({ kind: 'slug', slug: 'stmary' });
    expect(parseSchoolQuery('Portal.StMary.org/home', 'famitenly.com')).toEqual({ kind: 'host', host: 'portal.stmary.org' });
    expect(parseSchoolQuery('St. Mary  Catholic School', 'famitenly.com')).toEqual({ kind: 'name', name: 'St. Mary Catholic School' });
  });
  it('rejects empty input and the platform itself', () => {
    expect(parseSchoolQuery('   ')).toBeNull();
    expect(parseSchoolQuery('https://family-portal-brown.vercel.app/platform', 'localhost')).toBeNull();
    expect(parseSchoolQuery('famitenly.com', 'famitenly.com')).toBeNull();
    expect(parseSchoolQuery('platform.famitenly.com', 'famitenly.com')).toBeNull();
  });
});

describe('findSchool', () => {
  it('finds an open school by code, address or exact name', async () => {
    const slug = open.tenant.slug;
    for (const input of [slug.toUpperCase(), `https://x.vercel.app/s/${slug}`, 'saint  finder academy']) {
      const r = await findSchool(parseSchoolQuery(input, 'localhost')!);
      expect(r.kind === 'found' && r.tenant.id).toBe(open.tenant.id);
    }
  });

  it('does not match partial names', async () => {
    expect((await findSchool({ kind: 'name', name: 'Saint Finder' })).kind).toBe('none');
    expect((await findSchool({ kind: 'name', name: 'finder' })).kind).toBe('none');
  });

  it('never finds suspended schools', async () => {
    expect((await findSchool({ kind: 'slug', slug: closed.tenant.slug })).kind).toBe('none');
  });

  it('finds verified custom domains only', async () => {
    const host = `portal-${open.tenant.slug}.example-school.org`;
    await platformDb().insert(tenantDomains).values({ tenantId: open.tenant.id, hostname: host, kind: 'custom' });
    expect((await findSchool({ kind: 'host', host })).kind).toBe('none');
    await platformDb().update(tenantDomains).set({ verifiedAt: new Date() }).where(eq(tenantDomains.hostname, host));
    expect((await findSchool({ kind: 'host', host })).kind).toBe('found');
  });

  it('sends staff to the admin on the platform address', () => {
    expect(adminPath({ slug: 'stmary' })).toBe('/s/stmary/admin');
  });
});
