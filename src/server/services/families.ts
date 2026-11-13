// Family accounts: join code, requests, approval and grades.
//
// Families ask to join with the school's code (shared in a newsletter or by
// the office). Nothing is visible to them until a staff member with
// users.invite approves the request. Email ownership is not verified yet
// (no email provider), which is why the office checks each request.
import { randomInt, timingSafeEqual } from 'node:crypto';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { familyGrades, familyRequests, grades, memberships, tenantSettings, user } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, can, type AuthzContext } from '../rbac/authorize';
import { ValidationError } from './modules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Open requests per school; stops a leaked code from flooding the queue. */
export const MAX_PENDING_REQUESTS = 300;
// No 0/O, 1/I/L: the code is read aloud and typed from paper.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function deny(msg: string): never {
  throw new AuthorizationError(msg);
}
function need(ctx: AuthzContext, perm: 'users.view' | 'users.invite') {
  assertVerifiedContext(ctx);
  if (!can(ctx, perm)) deny(`Not allowed: ${perm}`);
}

export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function codesMatch(a: string, b: string) {
  const x = Buffer.from(normalizeCode(a));
  const y = Buffer.from(normalizeCode(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function newCode() {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

async function settingsRow(tx: Tx, tenantId: string) {
  const [s] = await tx.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  return s ?? null;
}

async function validGrades(tx: Tx, gradeIds: string[]) {
  const ids = [...new Set(gradeIds)].filter((g) => UUID.test(g));
  if (ids.length === 0) throw new ValidationError('Choose at least one grade.');
  if (ids.length > 15) throw new ValidationError('Choose at most 15 grades.');
  const found = await tx.select({ id: grades.id }).from(grades).where(inArray(grades.id, ids));
  if (found.length !== ids.length) throw new ValidationError('Choose grades from the list.');
  return ids;
}

// ---------- Join code ----------

export async function getJoinCode(ctx: AuthzContext, db: Db = platformDb()) {
  need(ctx, 'users.invite');
  return withTenant(ctx.tenantId, async (tx) => (await settingsRow(tx, ctx.tenantId))?.familyJoinCode ?? null, db);
}

/** Turns joining on with a fresh code (also used to replace a leaked code), or off. */
export async function setJoinCode(ctx: AuthzContext, open: boolean, db: Db = platformDb()) {
  need(ctx, 'users.invite');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const code = open ? newCode() : null;
      await tx
        .insert(tenantSettings)
        .values({ tenantId: ctx.tenantId, familyJoinCode: code })
        .onConflictDoUpdate({ target: tenantSettings.tenantId, set: { familyJoinCode: code, updatedAt: new Date() } });
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: open ? 'families.join_code_set' : 'families.join_closed', targetType: 'tenant', targetId: ctx.tenantId });
      return code;
    },
    db,
  );
}

/** What the public join page needs. Never reveals the code. */
export async function getJoinPageInfo(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => ({
      open: !!(await settingsRow(tx, tenantId))?.familyJoinCode,
      grades: await tx.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sortOrder)),
    }),
    db,
  );
}

/** Checked before an account is created, so a wrong code creates nothing. */
export async function checkJoinCode(tenantId: string, code: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const current = (await settingsRow(tx, tenantId))?.familyJoinCode;
      return !!current && codesMatch(current, code);
    },
    db,
  );
}

// ---------- Requests ----------

export const joinSchema = z
  .object({
    code: z.string().max(40),
    gradeIds: z.array(z.string()).max(15),
    note: z.string().trim().max(1000).default(''),
  })
  .strict();

export async function requestToJoin(tenantId: string, userId: string, input: unknown, db: Db = platformDb()) {
  const p = joinSchema.safeParse(input);
  if (!p.success) throw new ValidationError('Check the form and try again.');
  const v = p.data;
  if (!v.note) throw new ValidationError("Tell the office your children's names and grades so they can confirm your family.");
  return withTenant(
    tenantId,
    async (tx) => {
      const current = (await settingsRow(tx, tenantId))?.familyJoinCode;
      if (!current) throw new ValidationError('This school is not accepting new family accounts right now.');
      if (!codesMatch(current, v.code)) throw new ValidationError('That school code is not right. Check it with the school office.');
      const gradeIds = await validGrades(tx, v.gradeIds);
      const [m] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
      if (m) throw new ValidationError('Your account already belongs to this school.');
      const [open] = await tx
        .select({ id: familyRequests.id })
        .from(familyRequests)
        .where(and(eq(familyRequests.userId, userId), eq(familyRequests.status, 'pending')));
      if (open) throw new ValidationError('You already asked to join. The school office will review it.');
      const [c] = await tx.select({ n: count() }).from(familyRequests).where(eq(familyRequests.status, 'pending'));
      if ((c?.n ?? 0) >= MAX_PENDING_REQUESTS) throw new ValidationError('The school has too many requests waiting. Please contact the office.');
      const [row] = await tx.insert(familyRequests).values({ tenantId, userId, gradeIds, note: v.note }).returning();
      await audit(tx, { tenantId, actorUserId: userId, action: 'families.requested', targetType: 'family_request', targetId: row!.id });
      return row!;
    },
    db,
  );
}

/** For the signed-in person: are they a family here, waiting, or neither? */
export async function myFamilyStatus(tenantId: string, userId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.userId, userId));
      if (m) return { state: m.kind === 'family' ? (m.status === 'active' ? 'family' : 'suspended') : 'staff' } as const;
      const [r] = await tx.select().from(familyRequests).where(eq(familyRequests.userId, userId)).orderBy(desc(familyRequests.createdAt)).limit(1);
      if (r?.status === 'pending') return { state: 'pending' } as const;
      if (r?.status === 'rejected') return { state: 'rejected' } as const;
      return { state: 'none' } as const;
    },
    db,
  );
}

export async function listFamilyRequests(ctx: AuthzContext, db: Db = platformDb()) {
  need(ctx, 'users.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select({ r: familyRequests, name: user.name, email: user.email })
        .from(familyRequests)
        .innerJoin(user, eq(user.id, familyRequests.userId))
        .where(eq(familyRequests.status, 'pending'))
        .orderBy(asc(familyRequests.createdAt));
      return rows.map((x) => ({ ...x.r, name: x.name, email: x.email }));
    },
    db,
  );
}

/** Approves a request, optionally correcting the grades the family chose. */
export async function approveFamilyRequest(ctx: AuthzContext, requestId: string, gradeIds?: string[], db: Db = platformDb()) {
  need(ctx, 'users.invite');
  if (!UUID.test(requestId)) throw new ValidationError('Request not found.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [r] = await tx.select().from(familyRequests).where(eq(familyRequests.id, requestId)).for('update');
      if (!r || r.status !== 'pending') throw new ValidationError('Request not found or already handled.');
      const ids = await validGrades(tx, gradeIds ?? r.gradeIds);
      const [existing] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, r.userId));
      if (existing) throw new ValidationError('This person already belongs to the school.');
      const [m] = await tx
        .insert(memberships)
        .values({ tenantId: ctx.tenantId, userId: r.userId, kind: 'family', status: 'active', invitedByUserId: ctx.userId })
        .returning();
      await tx.insert(familyGrades).values(ids.map((gradeId) => ({ tenantId: ctx.tenantId, membershipId: m!.id, gradeId })));
      await tx.update(familyRequests).set({ status: 'approved', decidedByUserId: ctx.userId, decidedAt: new Date(), gradeIds: ids }).where(eq(familyRequests.id, r.id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'families.approved', targetType: 'membership', targetId: m!.id, metadata: { requestId: r.id, gradeIds: ids } });
      return m!;
    },
    db,
  );
}

export async function rejectFamilyRequest(ctx: AuthzContext, requestId: string, db: Db = platformDb()) {
  need(ctx, 'users.invite');
  if (!UUID.test(requestId)) throw new ValidationError('Request not found.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [r] = await tx.select().from(familyRequests).where(eq(familyRequests.id, requestId)).for('update');
      if (!r || r.status !== 'pending') throw new ValidationError('Request not found or already handled.');
      await tx.update(familyRequests).set({ status: 'rejected', decidedByUserId: ctx.userId, decidedAt: new Date() }).where(eq(familyRequests.id, r.id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'families.rejected', targetType: 'family_request', targetId: r.id });
    },
    db,
  );
}

// ---------- Families ----------

export async function listFamilies(ctx: AuthzContext, db: Db = platformDb()) {
  need(ctx, 'users.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select({ m: memberships, name: user.name, email: user.email })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(memberships.kind, 'family'))
        .orderBy(asc(user.name));
      const fg = rows.length
        ? await tx.select().from(familyGrades).where(inArray(familyGrades.membershipId, rows.map((r) => r.m.id)))
        : [];
      return rows.map((r) => ({ ...r.m, name: r.name, email: r.email, gradeIds: fg.filter((g) => g.membershipId === r.m.id).map((g) => g.gradeId) }));
    },
    db,
  );
}

export async function setFamilyGrades(ctx: AuthzContext, membershipId: string, gradeIds: string[], db: Db = platformDb()) {
  need(ctx, 'users.invite');
  if (!UUID.test(membershipId)) throw new ValidationError('Family not found.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId)).for('update');
      if (!m || m.kind !== 'family') throw new ValidationError('Family not found.');
      const ids = await validGrades(tx, gradeIds);
      await tx.delete(familyGrades).where(eq(familyGrades.membershipId, m.id));
      await tx.insert(familyGrades).values(ids.map((gradeId) => ({ tenantId: ctx.tenantId, membershipId: m.id, gradeId })));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'families.grades_changed', targetType: 'membership', targetId: m.id, metadata: { gradeIds: ids } });
    },
    db,
  );
}
