// Platform operations: real metrics, the platform team and custom domains across schools.
// Every number here comes from a database query; nothing is estimated or decorative.
import { and, count, desc, eq, gt, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, type Db, type Tx } from '../db/client';
import { auditLogs, calendarImports, plans, platformAdmins, subscriptions, supportGrants, tenantDomains, tenants, user } from '../db/schema';
import { audit } from '../audit/log';
import { AuthorizationError } from '../rbac/authorize';
import { ValidationError } from './modules';
import { assertPlatformContext, storageByTenant, type PlatformContext, type PlatformRole } from './platform';

const DAY = 86400_000;

export async function getPlatformHealth(ctx: PlatformContext, db: Db = platformDb()) {
  assertPlatformContext(ctx);
  const now = new Date();
  const statusRows = await db.select({ status: tenants.status, n: count() }).from(tenants).groupBy(tenants.status);
  const subRows = await db.select({ status: subscriptions.status, n: count() }).from(subscriptions).groupBy(subscriptions.status);
  const trialsEnding = await db
    .select({ id: tenants.id, name: tenants.name, trialEndsAt: subscriptions.trialEndsAt })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .where(and(eq(subscriptions.status, 'trialing'), isNotNull(subscriptions.trialEndsAt), lte(subscriptions.trialEndsAt, new Date(now.getTime() + 14 * DAY))))
    .orderBy(subscriptions.trialEndsAt);
  const pastDue = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .where(eq(subscriptions.status, 'past_due'));

  const storage = await storageByTenant(db);
  const limits = await db
    .select({ id: tenants.id, name: tenants.name, limitMb: plans.storageLimitMb })
    .from(tenants)
    .innerJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .innerJoin(plans, eq(plans.id, subscriptions.planId));
  const storageRows = limits
    .map((l) => ({ ...l, bytes: storage.get(l.id) ?? 0, limitBytes: l.limitMb * 1024 * 1024 }))
    .map((l) => ({ ...l, pct: l.limitBytes ? Math.round((l.bytes / l.limitBytes) * 100) : 0 }))
    .sort((x, y) => y.pct - x.pct);

  // Calendar imports whose file had rows the importer could not read (last 30 days).
  const importIssues = await db
    .select({ id: tenants.id, name: tenants.name, n: count() })
    .from(calendarImports)
    .innerJoin(tenants, eq(tenants.id, calendarImports.tenantId))
    .where(and(gt(calendarImports.createdAt, new Date(now.getTime() - 30 * DAY)), sql`jsonb_array_length(coalesce(${calendarImports.summary}->'errors', '[]'::jsonb)) > 0`))
    .groupBy(tenants.id, tenants.name);

  const [pendingSupport] = await db
    .select({ n: count() })
    .from(supportGrants)
    .where(and(isNull(supportGrants.approvedAt), isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, now)));
  const [activeSupport] = await db
    .select({ n: count() })
    .from(supportGrants)
    .where(and(isNotNull(supportGrants.approvedAt), isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, now)));

  const domainsWaiting = await db
    .select({ hostname: tenantDomains.hostname, school: tenants.name, tenantId: tenants.id, createdAt: tenantDomains.createdAt })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(and(eq(tenantDomains.kind, 'custom'), isNull(tenantDomains.verifiedAt)));
  const domainsVerified = await db
    .select({ hostname: tenantDomains.hostname, school: tenants.name, tenantId: tenants.id, verifiedAt: tenantDomains.verifiedAt })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(and(eq(tenantDomains.kind, 'custom'), isNotNull(tenantDomains.verifiedAt)))
    .orderBy(desc(tenantDomains.verifiedAt));

  // Suspicious-looking activity worth a look: denied support, school suspensions (last 7 days).
  const recentSecurity = await db
    .select({ id: auditLogs.id, action: auditLogs.action, createdAt: auditLogs.createdAt, school: tenants.name })
    .from(auditLogs)
    .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
    .where(
      and(
        gt(auditLogs.createdAt, new Date(now.getTime() - 7 * DAY)),
        sql`${auditLogs.action} in ('support.declined', 'support.revoked', 'platform.school_suspended', 'platform.owner_recovery_invited', 'platform.team_changed')`,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);

  return {
    schools: Object.fromEntries(statusRows.map((r) => [r.status, r.n])) as Record<string, number>,
    subscriptions: Object.fromEntries(subRows.map((r) => [r.status, r.n])) as Record<string, number>,
    trialsEnding,
    pastDue,
    storage: storageRows,
    totalStorageBytes: [...storage.values()].reduce((a, b) => a + b, 0),
    importIssues,
    support: { pending: pendingSupport?.n ?? 0, active: activeSupport?.n ?? 0 },
    domainsWaiting,
    domainsVerified,
    recentSecurity,
  };
}

// ---------- Platform team ----------

function assertOwner(ctx: PlatformContext) {
  assertPlatformContext(ctx);
  if (ctx.role !== 'owner') throw new AuthorizationError('Only platform owners manage the platform team.');
}

export async function listPlatformTeam(ctx: PlatformContext, db: Db = platformDb()) {
  assertPlatformContext(ctx);
  return db
    .select({ userId: platformAdmins.userId, role: platformAdmins.role, since: platformAdmins.createdAt, name: user.name, email: user.email, twoFactor: user.twoFactorEnabled })
    .from(platformAdmins)
    .innerJoin(user, eq(user.id, platformAdmins.userId))
    .orderBy(user.name);
}

const roleSchema = z.enum(['owner', 'operator', 'support']);

async function ownersLeft(db: Db | Tx, excludeUserId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.role, 'owner'), sql`${platformAdmins.userId} <> ${excludeUserId}`));
  return r?.n ?? 0;
}

/** Adds an existing account (it must already have signed up or been invited somewhere) to the platform team. */
export async function addPlatformMember(ctx: PlatformContext, email: string, role: string, db: Db = platformDb()) {
  assertOwner(ctx);
  const r = roleSchema.safeParse(role);
  if (!r.success) throw new ValidationError('Choose a role.');
  const e = email.trim().toLowerCase();
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, e));
  if (!u) throw new ValidationError('No account uses that email yet. The person needs an account first (for example by accepting a school invitation).');
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(platformAdmins).where(eq(platformAdmins.userId, u.id));
    if (existing) throw new ValidationError('That person is already on the platform team.');
    await tx.insert(platformAdmins).values({ userId: u.id, role: r.data });
    await audit(tx, { tenantId: null, actorUserId: ctx.userId, actorKind: 'platform', action: 'platform.team_changed', targetType: 'user', targetId: u.id, metadata: { change: 'added', role: r.data, email: e } });
  });
}

export async function setPlatformRole(ctx: PlatformContext, userId: string, role: string, db: Db = platformDb()) {
  assertOwner(ctx);
  const r = roleSchema.safeParse(role);
  if (!r.success) throw new ValidationError('Choose a role.');
  if (userId === ctx.userId) throw new ValidationError('You cannot change your own role.');
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(platformAdmins).where(eq(platformAdmins.userId, userId));
    if (!m) throw new ValidationError('Not on the platform team.');
    if (m.role === 'owner' && r.data !== 'owner' && (await ownersLeft(tx, userId)) < 1) throw new ValidationError('The platform must keep at least one owner.');
    await tx.update(platformAdmins).set({ role: r.data }).where(eq(platformAdmins.userId, userId));
    await audit(tx, { tenantId: null, actorUserId: ctx.userId, actorKind: 'platform', action: 'platform.team_changed', targetType: 'user', targetId: userId, metadata: { change: 'role', from: m.role, to: r.data } });
  });
}

export async function removePlatformMember(ctx: PlatformContext, userId: string, db: Db = platformDb()) {
  assertOwner(ctx);
  if (userId === ctx.userId) throw new ValidationError('You cannot remove yourself.');
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(platformAdmins).where(eq(platformAdmins.userId, userId));
    if (!m) throw new ValidationError('Not on the platform team.');
    if (m.role === 'owner' && (await ownersLeft(tx, userId)) < 1) throw new ValidationError('The platform must keep at least one owner.');
    await tx.delete(platformAdmins).where(eq(platformAdmins.userId, userId));
    // Open support access ends with the role.
    await tx.update(supportGrants).set({ revokedAt: new Date() }).where(and(eq(supportGrants.platformUserId, userId), isNull(supportGrants.revokedAt)));
    await audit(tx, { tenantId: null, actorUserId: ctx.userId, actorKind: 'platform', action: 'platform.team_changed', targetType: 'user', targetId: userId, metadata: { change: 'removed', role: m.role } });
  });
}
