// Platform (Super Admin) operations: schools, subscriptions and first administrators.
//
// Platform authority is separate from school authority. A platform context only
// comes from loadPlatformContext(), and it never grants access to a school's
// content: creating a school, changing its plan or suspending it are platform
// records; reading its announcements or documents would need a support grant.
import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db } from '../db/client';
import {
  auditLogs,
  documents,
  documentVersions,
  invitations,
  membershipRoles,
  memberships,
  plans,
  platformAdmins,
  roles,
  subscriptions,
  tenantDomains,
  tenants,
  user,
} from '../db/schema';
import { audit } from '../audit/log';
import { AuthorizationError } from '../rbac/authorize';
import { MODULES } from '../modules/registry';
import { provisionTenant, PK8_GRADES, type GradeInput } from '../tenancy/provision';
import { isValidSlug } from '../tenancy/resolve';
import { rootDomain } from '../tenancy/config';
import { DEFAULT_THEME, themeTokensSchema } from '../theme/tokens';
import { ValidationError } from './modules';
import { hashToken, INVITE_DAYS } from './staff';

export type PlatformRole = 'owner' | 'operator' | 'support';
export type PlatformContext = { readonly userId: string; readonly role: PlatformRole };

const verified = new WeakSet<PlatformContext>();

export async function loadPlatformContext(userId: string | null | undefined, db: Db = platformDb()): Promise<PlatformContext | null> {
  if (!userId) return null;
  const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, userId));
  if (!row) return null;
  const ctx = Object.freeze({ userId, role: row.role });
  verified.add(ctx);
  return ctx;
}

export type PlatformAction = 'schools.view' | 'schools.manage' | 'subscriptions.manage';

const ACTIONS: Record<PlatformAction, PlatformRole[]> = {
  'schools.view': ['owner', 'operator', 'support'],
  'schools.manage': ['owner', 'operator'],
  'subscriptions.manage': ['owner', 'operator'],
};

export function platformCan(ctx: PlatformContext, action: PlatformAction): boolean {
  return verified.has(ctx) && ACTIONS[action].includes(ctx.role);
}

function assertPlatform(ctx: PlatformContext, action: PlatformAction) {
  if (!verified.has(ctx)) throw new AuthorizationError('Unverified platform context.');
  if (!ACTIONS[action].includes(ctx.role)) throw new AuthorizationError(`Platform permission required: ${action}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Grade structures ----------

const K = PK8_GRADES.filter((g) => g.code === 'K');
const PK = PK8_GRADES.filter((g) => g.level === 'preschool');
const gradesFrom = (from: number, to: number, level: (n: number) => GradeInput['level']) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => ({ code: String(n), name: `Grade ${n}`, level: level(n) }));
const lvl = (n: number): GradeInput['level'] => (n <= 5 ? 'elementary' : n <= 8 ? 'middle' : 'high');

export const GRADE_STRUCTURES = {
  'pk-8': { label: 'Preschool to Grade 8', grades: [...PK, ...K, ...gradesFrom(1, 8, lvl)] },
  'k-8': { label: 'Kindergarten to Grade 8', grades: [...K, ...gradesFrom(1, 8, lvl)] },
  'pk-12': { label: 'Preschool to Grade 12', grades: [...PK, ...K, ...gradesFrom(1, 12, lvl)] },
  'k-12': { label: 'Kindergarten to Grade 12', grades: [...K, ...gradesFrom(1, 12, lvl)] },
  '9-12': { label: 'High school (Grades 9 to 12)', grades: gradesFrom(9, 12, lvl) },
} as const satisfies Record<string, { label: string; grades: GradeInput[] }>;
export type GradeStructure = keyof typeof GRADE_STRUCTURES;

// ---------- Reads ----------

export async function listPlans(db: Db = platformDb()) {
  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.name));
}

/** All schools with platform-level facts only (no school content). */
export async function listSchools(ctx: PlatformContext, db: Db = platformDb()) {
  assertPlatform(ctx, 'schools.view');
  const rows = await db
    .select({ t: tenants, planName: plans.name, planId: subscriptions.planId, subStatus: subscriptions.status, trialEndsAt: subscriptions.trialEndsAt })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .orderBy(asc(tenants.name));
  const ids = rows.map((r) => r.t.id);
  if (!ids.length) return [];
  const people = await db
    .select({ tenantId: memberships.tenantId, kind: memberships.kind, n: count() })
    .from(memberships)
    .where(and(inArray(memberships.tenantId, ids), eq(memberships.status, 'active')))
    .groupBy(memberships.tenantId, memberships.kind);
  const storage = await storageByTenant(db, ids);
  return rows.map((r) => ({
    ...r.t,
    planName: r.planName,
    planId: r.planId,
    subscriptionStatus: r.subStatus,
    trialEndsAt: r.trialEndsAt,
    staff: people.find((p) => p.tenantId === r.t.id && p.kind === 'staff')?.n ?? 0,
    families: people.find((p) => p.tenantId === r.t.id && p.kind === 'family')?.n ?? 0,
    storageBytes: storage.get(r.t.id) ?? 0,
  }));
}

/** Bytes stored per school: every kept document version counts. */
export async function storageByTenant(db: Db, ids?: string[]) {
  const rows = await db
    .select({ tenantId: documentVersions.tenantId, bytes: sql<string>`coalesce(sum(${documentVersions.sizeBytes}), 0)` })
    .from(documentVersions)
    .where(ids ? inArray(documentVersions.tenantId, ids) : undefined)
    .groupBy(documentVersions.tenantId);
  return new Map(rows.map((r) => [r.tenantId, Number(r.bytes)]));
}

export async function getSchool(ctx: PlatformContext, tenantId: string, db: Db = platformDb()) {
  assertPlatform(ctx, 'schools.view');
  if (!UUID.test(tenantId)) return null;
  const [row] = await db
    .select({ t: tenants, sub: subscriptions, plan: plans })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) return null;
  // School owners: name and email only, so the platform knows who to contact.
  const owners = await db
    .selectDistinct({ name: user.name, email: user.email, status: memberships.status })
    .from(membershipRoles)
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(membershipRoles.tenantId, tenantId), eq(roles.isOwnerRole, true)));
  const ownerInvites = await db
    .select({ id: invitations.id, email: invitations.email, name: invitations.name, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .where(and(eq(invitations.tenantId, tenantId), eq(roles.isOwnerRole, true), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .orderBy(desc(invitations.createdAt));
  const domains = await db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId));
  const activity = await db
    .select({ id: auditLogs.id, action: auditLogs.action, actorKind: auditLogs.actorKind, createdAt: auditLogs.createdAt, metadata: auditLogs.metadata, actor: user.email })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.tenantId, tenantId), inArray(auditLogs.actorKind, ['platform', 'system', 'support'])))
    .orderBy(desc(auditLogs.createdAt))
    .limit(30);
  const [docCount] = await db.select({ n: count() }).from(documents).where(eq(documents.tenantId, tenantId));
  const storage = (await storageByTenant(db, [tenantId])).get(tenantId) ?? 0;
  return {
    tenant: row.t,
    subscription: row.sub,
    plan: row.plan,
    owners,
    ownerInvites: ownerInvites.map((i) => ({ ...i, expired: i.expiresAt <= new Date() })),
    domains,
    activity,
    usage: { documents: docCount?.n ?? 0, storageBytes: storage },
  };
}

// ---------- Create a school ----------

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit colour such as #16335B.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date.');
const TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

export const newSchoolSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the school name.').max(120),
    shortName: z.string().trim().max(40).default(''),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .refine(isValidSlug, 'Use lowercase letters, numbers and dashes only (some words such as "admin" are reserved).'),
    timezone: z.string().refine((t) => TIMEZONES.has(t), 'Choose a time zone from the list.'),
    phone: z.string().trim().max(40).default(''),
    email: z.union([z.literal(''), z.email('Enter a valid office email.')]).default(''),
    website: z.union([z.literal(''), z.url({ protocol: /^https$/, message: 'Use a full https:// address.' })]).default(''),
    primaryColor: hex,
    accentColor: hex,
    yearLabel: z.string().trim().min(4, 'Name the school year, for example 2026-27.').max(20),
    yearStart: date,
    yearEnd: date,
    gradeStructure: z.enum(Object.keys(GRADE_STRUCTURES) as [GradeStructure, ...GradeStructure[]]),
    excludeGrades: z.array(z.string()).default([]),
    adminName: z.string().trim().min(1, 'Enter the administrator’s name.').max(120),
    adminEmail: z.email('Enter the administrator’s email.').transform((e) => e.trim().toLowerCase()),
    planId: z.string().min(1, 'Choose a plan.'),
    subscriptionStatus: z.enum(['trialing', 'active', 'comped']).default('trialing'),
    trialDays: z.coerce.number().int().min(1).max(365).default(30),
    modules: z.array(z.string()).default([]),
  })
  .strict()
  .refine((v) => v.yearEnd > v.yearStart, { message: 'The school year must end after it starts.', path: ['yearEnd'] });

export type NewSchoolInput = z.input<typeof newSchoolSchema>;

/**
 * Creates a school in "onboarding" state with its first administrator invited
 * as School Owner. Returns the invitation token, shown once.
 */
export async function createSchool(ctx: PlatformContext, input: unknown, db: Db = platformDb()) {
  assertPlatform(ctx, 'schools.manage');
  const p = newSchoolSchema.safeParse(input);
  if (!p.success) throw new ValidationError(p.error.issues.map((i) => i.message).join(' '));
  const v = p.data;

  const [plan] = await db.select().from(plans).where(and(eq(plans.id, v.planId), eq(plans.isActive, true)));
  if (!plan) throw new ValidationError('Choose a plan from the list.');
  const [taken] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, v.slug));
  if (taken) throw new ValidationError(`The address "${v.slug}" is already used by another school.`);

  const theme = themeTokensSchema.parse({
    ...DEFAULT_THEME,
    colors: { ...DEFAULT_THEME.colors, primary: v.primaryColor.toUpperCase(), secondary: v.primaryColor.toUpperCase(), accent: v.accentColor.toUpperCase() },
  });
  // Brand colours never block: links and text on fills are adjusted for contrast at render time.

  const structure = GRADE_STRUCTURES[v.gradeStructure].grades;
  const gradeList = structure.filter((g) => !v.excludeGrades.includes(g.code));
  if (!gradeList.length) throw new ValidationError('Keep at least one grade.');

  // Only implemented modules the plan includes can be switched on.
  const entitled = new Set([...plan.includedModules]);
  const unknown = v.modules.filter((m) => !MODULES.some((x) => x.id === m && x.implemented && entitled.has(m)));
  if (unknown.length) throw new ValidationError('Some chosen modules are not available on this plan.');

  const root = rootDomain();
  const tenant = await provisionTenant(
    {
      slug: v.slug,
      name: v.name,
      timezone: v.timezone,
      planId: plan.id,
      status: 'onboarding',
      profile: {
        displayName: v.name,
        shortName: v.shortName || null,
        phone: v.phone || null,
        email: v.email || null,
        websiteUrl: v.website || null,
      },
      grades: gradeList,
      academicYear: { label: v.yearLabel, startsOn: v.yearStart, endsOn: v.yearEnd },
      theme,
      enabledModules: v.modules,
      createdByUserId: ctx.userId,
      subdomainHost: root !== 'localhost' ? `${v.slug}.${root}` : undefined,
    },
    db,
  );

  await db
    .update(subscriptions)
    .set({
      status: v.subscriptionStatus,
      trialEndsAt: v.subscriptionStatus === 'trialing' ? new Date(Date.now() + v.trialDays * 86400_000) : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.tenantId, tenant.id));

  const token = await issueOwnerInvitation(ctx, tenant.id, { name: v.adminName, email: v.adminEmail }, db, 'school.created');
  return { tenant, token };
}

// ---------- First administrator / recovery ----------

const ownerInviteSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(120),
    email: z.email('Enter a valid email.').transform((e) => e.trim().toLowerCase()),
  })
  .strict();

/**
 * Invites someone as School Owner. Used for the first administrator and to
 * recover a school whose owners have left. Replaces earlier pending owner
 * invitations for the same email. Returns the raw token (shown once).
 */
export async function issueOwnerInvitation(
  ctx: PlatformContext,
  tenantId: string,
  input: unknown,
  db: Db = platformDb(),
  reason: 'school.created' | 'owner.recovery' = 'owner.recovery',
) {
  assertPlatform(ctx, 'schools.manage');
  if (!UUID.test(tenantId)) throw new ValidationError('School not found.');
  const p = ownerInviteSchema.safeParse(input);
  if (!p.success) throw new ValidationError(p.error.issues.map((i) => i.message).join(' '));
  const v = p.data;
  return withTenant(
    tenantId,
    async (tx) => {
      const [owner] = await tx.select().from(roles).where(eq(roles.isOwnerRole, true)).limit(1);
      if (!owner) throw new ValidationError('This school has no owner role.');
      const [member] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(user.email, v.email));
      if (member) throw new ValidationError('That person already belongs to this school. A School Owner there can change their role.');
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.email, v.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      const token = randomBytes(32).toString('base64url');
      const [inv] = await tx
        .insert(invitations)
        .values({
          tenantId,
          email: v.email,
          name: v.name,
          title: 'School Owner',
          roleId: owner.id,
          scopeType: 'school',
          tokenHash: hashToken(token),
          invitedByUserId: ctx.userId,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000),
        })
        .returning();
      await audit(tx, {
        tenantId,
        actorUserId: ctx.userId,
        actorKind: 'platform',
        action: reason === 'school.created' ? 'platform.owner_invited' : 'platform.owner_recovery_invited',
        targetType: 'invitation',
        targetId: inv!.id,
        metadata: { email: v.email },
      });
      return token;
    },
    db,
  );
}

export async function revokeOwnerInvitation(ctx: PlatformContext, tenantId: string, invitationId: string, db: Db = platformDb()) {
  assertPlatform(ctx, 'schools.manage');
  if (!UUID.test(tenantId) || !UUID.test(invitationId)) throw new ValidationError('Invitation not found.');
  await withTenant(
    tenantId,
    async (tx) => {
      const [row] = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .returning();
      if (!row) throw new ValidationError('Invitation not found or already used.');
      await audit(tx, { tenantId, actorUserId: ctx.userId, actorKind: 'platform', action: 'platform.owner_invite_revoked', targetType: 'invitation', targetId: invitationId });
    },
    db,
  );
}

// ---------- Status ----------

export type SchoolStatusChange = 'launch' | 'suspend' | 'reactivate';

/**
 * launch: onboarding → active. suspend: portal and dashboard become
 * unavailable, data is kept. reactivate: suspended → active.
 */
export async function changeSchoolStatus(ctx: PlatformContext, tenantId: string, change: SchoolStatusChange, reason = '', db: Db = platformDb()) {
  assertPlatform(ctx, 'schools.manage');
  if (!UUID.test(tenantId)) throw new ValidationError('School not found.');
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!t) throw new ValidationError('School not found.');
  const allowed: Record<SchoolStatusChange, string[]> = { launch: ['onboarding'], suspend: ['onboarding', 'active'], reactivate: ['suspended'] };
  if (!allowed[change].includes(t.status)) throw new ValidationError(`A school that is ${t.status} cannot be changed that way.`);
  const why = reason.trim().slice(0, 300);
  if (change === 'suspend' && !why) throw new ValidationError('Write the reason for suspending the school.');
  if (change === 'launch') {
    const [owners] = await db
      .select({ n: count() })
      .from(membershipRoles)
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
      .where(and(eq(membershipRoles.tenantId, tenantId), eq(roles.isOwnerRole, true), eq(memberships.status, 'active')));
    if (!owners?.n) throw new ValidationError('The school needs an administrator who has accepted the invitation before launch.');
  }
  const status = change === 'suspend' ? 'suspended' : 'active';
  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ status, updatedAt: new Date(), suspendedAt: change === 'suspend' ? new Date() : null, suspendedReason: change === 'suspend' ? why : null })
      .where(eq(tenants.id, tenantId));
    await audit(tx, {
      tenantId,
      actorUserId: ctx.userId,
      actorKind: 'platform',
      action: `platform.school_${change === 'launch' ? 'launched' : change === 'suspend' ? 'suspended' : 'reactivated'}`,
      targetType: 'tenant',
      targetId: tenantId,
      metadata: why ? { reason: why } : {},
    });
  });
}

// ---------- Subscription ----------

const subscriptionSchema = z
  .object({
    planId: z.string().min(1),
    status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'comped']),
    extraModules: z.array(z.string()).default([]),
    trialEndsAt: z.union([z.literal(''), date]).default(''),
    renewsAt: z.union([z.literal(''), date]).default(''),
  })
  .strict();

/**
 * Plan, status and extra modules. Billing is recorded here only; no payment is
 * taken. Losing a module never deletes its data: the school just can't use it.
 */
export async function updateSubscription(ctx: PlatformContext, tenantId: string, input: unknown, db: Db = platformDb()) {
  assertPlatform(ctx, 'subscriptions.manage');
  if (!UUID.test(tenantId)) throw new ValidationError('School not found.');
  const p = subscriptionSchema.safeParse(input);
  if (!p.success) throw new ValidationError(p.error.issues.map((i) => i.message).join(' '));
  const v = p.data;
  const [plan] = await db.select().from(plans).where(eq(plans.id, v.planId));
  if (!plan) throw new ValidationError('Choose a plan from the list.');
  const extras = [...new Set(v.extraModules)].filter((m) => !plan.includedModules.includes(m));
  if (extras.some((m) => !MODULES.some((x) => x.id === m && x.implemented))) throw new ValidationError('Only available modules can be added.');
  if (v.status === 'trialing' && !v.trialEndsAt) throw new ValidationError('A trial needs an end date.');
  const toDate = (d: string) => (d ? new Date(`${d}T00:00:00Z`) : null);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    if (!before) throw new ValidationError('School not found.');
    await tx
      .update(subscriptions)
      .set({ planId: plan.id, status: v.status, extraModules: extras, trialEndsAt: v.status === 'trialing' ? toDate(v.trialEndsAt) : null, renewsAt: toDate(v.renewsAt), updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, tenantId));
    await audit(tx, {
      tenantId,
      actorUserId: ctx.userId,
      actorKind: 'platform',
      action: 'platform.subscription_changed',
      targetType: 'subscription',
      targetId: before.id,
      metadata: { from: { planId: before.planId, status: before.status, extraModules: before.extraModules }, to: { planId: plan.id, status: v.status, extraModules: extras } },
    });
  });
}

/** Platform-level activity across all schools (newest first). */
export async function listPlatformActivity(ctx: PlatformContext, limit = 100, db: Db = platformDb()) {
  assertPlatform(ctx, 'schools.view');
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorKind: auditLogs.actorKind,
      createdAt: auditLogs.createdAt,
      metadata: auditLogs.metadata,
      actor: user.email,
      school: tenants.name,
      tenantId: auditLogs.tenantId,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorUserId))
    .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
    .where(inArray(auditLogs.actorKind, ['platform', 'system', 'support']))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}
