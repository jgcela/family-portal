// "School login" from the marketing site: a school administrator types the
// school's code, its portal address or its exact name, and is sent to that
// school's admin. Only exact matches count, so the form cannot be used to
// list schools, and suspended or archived schools are never found.
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { platformDb, type Db } from '../db/client';
import { tenantDomains, tenants } from '../db/schema';
import { pathTenantsAllowed, rootDomain } from './config';
import { isValidSlug, normalizeHost } from './resolve';
import { isServable, type TenantRecord } from './tenants';

export type SchoolQuery = { kind: 'slug'; slug: string } | { kind: 'host'; host: string } | { kind: 'name'; name: string };

/**
 * Reads what the person typed. Accepts a code ("stmary"), a portal address
 * ("https://family-portal-brown.vercel.app/s/stmary", "stmary.example.com",
 * "portal.stmary.org/admin") or a school name.
 */
export function parseSchoolQuery(input: string, root = rootDomain()): SchoolQuery | null {
  const raw = input.trim().replace(/\s+/g, ' ');
  if (!raw || raw.length > 200) return null;
  const looksLikeAddress = /^https?:\/\//i.test(raw) || (!raw.includes(' ') && raw.includes('.'));
  if (looksLikeAddress) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = normalizeHost(url.hostname);
    const rootHost = normalizeHost(root);
    const fromPath = url.pathname.match(/^\/s\/([^/]+)/)?.[1]?.toLowerCase();
    if (fromPath) return isValidSlug(fromPath) ? { kind: 'slug', slug: fromPath } : null;
    if (host.endsWith(`.${rootHost}`)) {
      const sub = host.slice(0, -(rootHost.length + 1));
      return !sub.includes('.') && isValidSlug(sub) ? { kind: 'slug', slug: sub } : null;
    }
    if (host === rootHost || host.endsWith('.vercel.app')) return null;
    return { kind: 'host', host };
  }
  const slug = raw.toLowerCase();
  if (isValidSlug(slug)) return { kind: 'slug', slug };
  return { kind: 'name', name: raw };
}

export type FindResult = { kind: 'found'; tenant: TenantRecord } | { kind: 'none' };

export async function findSchool(q: SchoolQuery, db: Db = platformDb()): Promise<FindResult> {
  let rows: TenantRecord[] = [];
  if (q.kind === 'slug') {
    rows = await db.select().from(tenants).where(eq(tenants.slug, q.slug)).limit(1);
    // A code that happens to be a name ("Bishop") also gets a chance by name.
    if (!rows.length) return findSchool({ kind: 'name', name: q.slug }, db);
  } else if (q.kind === 'host') {
    const r = await db
      .select({ t: tenants })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
      .where(and(sql`lower(${tenantDomains.hostname}) = ${q.host}`, isNotNull(tenantDomains.verifiedAt)))
      .limit(1);
    rows = r.map((x) => x.t);
  } else {
    // Exact name, ignoring case and extra spaces. Two schools with the same
    // name are not guessed between: the person is asked for the code instead.
    rows = await db
      .select()
      .from(tenants)
      .where(sql`lower(regexp_replace(trim(${tenants.name}), '\\s+', ' ', 'g')) = ${q.name.toLowerCase()}`)
      .limit(2);
    if (rows.length !== 1) return { kind: 'none' };
  }
  const t = rows[0];
  return t && isServable(t) ? { kind: 'found', tenant: t } : { kind: 'none' };
}

/**
 * Where the school's admin lives on the platform's own address: /s/<slug>/admin
 * when path mode is on (as on *.vercel.app), else https://<slug>.<root>/admin.
 * Sign-in always works there; a school's own domain may still be in setup.
 */
export function adminPath(t: Pick<TenantRecord, 'slug'>): string {
  if (pathTenantsAllowed() || rootDomain() === 'localhost') return `/s/${t.slug}/admin`;
  return `https://${t.slug}.${rootDomain()}/admin`;
}
