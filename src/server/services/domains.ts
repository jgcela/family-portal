// Custom domains (e.g. portal.stmaryschool.org).
//
// A school adds a hostname, proves it controls it with a DNS TXT record, and
// only then does the platform serve the school on it. tenant_domains is a
// platform table (schools can only read their own rows), so writes go through
// the owner connection after the school's permission is checked here.
import { randomBytes } from 'node:crypto';
import { resolveTxt as nodeResolveTxt } from 'node:dns/promises';
import { and, eq, sql } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from '../db/client';
import { tenantDomains } from '../db/schema';
import { audit } from '../audit/log';
import { AuthorizationError, can, type AuthzContext } from '../rbac/authorize';
import { assertVerifiedContext } from '../rbac/context';
import { rootDomain } from '../tenancy/config';
import { normalizeHost } from '../tenancy/resolve';
import { ValidationError } from './modules';

export const TXT_PREFIX = '_familyportal';
export const MAX_CUSTOM_DOMAINS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type TxtResolver = (name: string) => Promise<string[][]>;

function assertDomains(ctx: AuthzContext) {
  assertVerifiedContext(ctx);
  if (ctx.support) throw new AuthorizationError('Support sessions cannot change domains.');
  if (!can(ctx, 'domains.manage')) throw new AuthorizationError('Only the School Owner can manage domains.', 'domains.manage');
}

export const txtRecordName = (hostname: string) => `${TXT_PREFIX}.${hostname}`;
export const txtRecordValue = (token: string) => `fp-verify=${token}`;

export async function listDomains(tenantId: string, db: Db = platformDb()) {
  return withTenant(tenantId, (tx) => tx.select().from(tenantDomains).orderBy(tenantDomains.createdAt), db);
}

export function validateHostname(input: string): string {
  const host = normalizeHost(input.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''));
  if (!HOST_RE.test(host)) throw new ValidationError('Enter a domain such as portal.yourschool.org.');
  const root = normalizeHost(rootDomain());
  if (host === root || host.endsWith(`.${root}`) || host.endsWith('.vercel.app') || host === 'localhost') {
    throw new ValidationError('Use a domain your school owns, not a platform address.');
  }
  return host;
}

export async function addDomain(ctx: AuthzContext, hostname: string, db: Db = platformDb()) {
  assertDomains(ctx);
  const host = validateHostname(hostname);
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ tenantId: tenantDomains.tenantId }).from(tenantDomains).where(sql`lower(${tenantDomains.hostname}) = ${host}`);
    if (taken) throw new ValidationError(taken.tenantId === ctx.tenantId ? 'That domain is already on your list.' : 'That domain is already used by another portal.');
    const mine = await tx.select({ id: tenantDomains.id }).from(tenantDomains).where(and(eq(tenantDomains.tenantId, ctx.tenantId), eq(tenantDomains.kind, 'custom')));
    if (mine.length >= MAX_CUSTOM_DOMAINS) throw new ValidationError(`A school can have up to ${MAX_CUSTOM_DOMAINS} custom domains.`);
    const [d] = await tx
      .insert(tenantDomains)
      .values({ tenantId: ctx.tenantId, hostname: host, kind: 'custom', isPrimary: false, verificationToken: randomBytes(18).toString('base64url') })
      .returning();
    await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'domain.added', targetType: 'domain', targetId: d!.id, metadata: { hostname: host } });
    return d!;
  });
}

async function loadOwn(db: Db, ctx: AuthzContext, id: string) {
  if (!UUID.test(id)) throw new ValidationError('Domain not found.');
  const [d] = await db.select().from(tenantDomains).where(and(eq(tenantDomains.id, id), eq(tenantDomains.tenantId, ctx.tenantId), eq(tenantDomains.kind, 'custom')));
  if (!d) throw new ValidationError('Domain not found.');
  return d;
}

/**
 * Looks up the TXT record and marks the domain verified when it matches. A
 * domain whose record later disappears stays verified until removed; checking
 * again never un-verifies it by accident during a DNS outage.
 */
export async function verifyDomain(ctx: AuthzContext, id: string, db: Db = platformDb(), resolveTxt: TxtResolver = nodeResolveTxt) {
  assertDomains(ctx);
  const d = await loadOwn(db, ctx, id);
  if (d.verifiedAt) return { verified: true as const, domain: d };
  let records: string[][] = [];
  try {
    records = await resolveTxt(txtRecordName(d.hostname));
  } catch {
    records = [];
  }
  const expected = txtRecordValue(d.verificationToken ?? '');
  const found = records.some((chunks) => chunks.join('').trim() === expected);
  if (!found) return { verified: false as const, domain: d };
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx.update(tenantDomains).set({ verifiedAt: new Date() }).where(eq(tenantDomains.id, d.id)).returning();
    await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'domain.verified', targetType: 'domain', targetId: d.id, metadata: { hostname: d.hostname } });
    return rows;
  });
  return { verified: true as const, domain: updated! };
}

export async function setPrimaryDomain(ctx: AuthzContext, id: string | null, db: Db = platformDb()) {
  assertDomains(ctx);
  const d = id ? await loadOwn(db, ctx, id) : null;
  if (d && !d.verifiedAt) throw new ValidationError('Verify the domain before making it the main address.');
  await db.transaction(async (tx) => {
    await tx.update(tenantDomains).set({ isPrimary: false }).where(and(eq(tenantDomains.tenantId, ctx.tenantId), eq(tenantDomains.kind, 'custom')));
    if (d) await tx.update(tenantDomains).set({ isPrimary: true }).where(eq(tenantDomains.id, d.id));
    await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'domain.primary_set', targetType: 'domain', targetId: d?.id, metadata: { hostname: d?.hostname ?? null } });
  });
}

export async function removeDomain(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertDomains(ctx);
  const d = await loadOwn(db, ctx, id);
  await db.transaction(async (tx) => {
    await tx.delete(tenantDomains).where(eq(tenantDomains.id, d.id));
    await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'domain.removed', targetType: 'domain', targetId: d.id, metadata: { hostname: d.hostname } });
  });
}
