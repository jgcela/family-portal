// Shared rules for the operations services (students, attendance, inbox,
// workflows).
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { getModuleState } from './modules';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, can, type AuthzContext } from '../rbac/authorize';
import { assertViewer, type Viewer } from '../viewer';
import { studentGuardians, students } from '../db/schema';
import { ValidationError } from './modules';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deny(msg: string): never {
  throw new AuthorizationError(msg);
}

export function assertId(id: string, what: string) {
  if (!UUID.test(id)) throw new ValidationError(`${what} not found.`);
}

/**
 * Staff access to student-level data. Support sessions never see it: they
 * are for fixing the portal, not for reading about children.
 */
export function assertStaff(ctx: AuthzContext, opts: { write?: boolean } = {}) {
  assertVerifiedContext(ctx);
  if (ctx.support) deny(opts.write ? 'Support sessions are read-only.' : 'Support sessions cannot open student records or requests.');
}

/** Grades where a scopable permission applies: 'all' for a school-wide grant. */
export function gradeScope(ctx: AuthzContext, permission: string): 'all' | string[] {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.some((g) => g.scopeType === 'school')) return 'all';
  return [...new Set(grants.filter((g) => g.scopeType === 'grade' && g.scopeId).map((g) => g.scopeId!))];
}

/** A record tied to one grade (or none = school-wide). */
export function canOnGrade(ctx: AuthzContext, permission: string, gradeId: string | null): boolean {
  return gradeId ? can(ctx, permission, { gradeIds: [gradeId] }) : can(ctx, permission);
}

export async function assertModules(tenantId: string, ids: string[]) {
  const st = await getModuleState(tenantId);
  const active = new Set(st.active.map((m) => m.id));
  for (const id of ids) if (!active.has(id)) throw new ValidationError('This feature is not switched on for the school.');
}

export async function activeModuleIds(tenantId: string): Promise<Set<string>> {
  const st = await getModuleState(tenantId);
  return new Set(st.active.map((m) => m.id));
}

export type FamilyViewer = Extract<Viewer, { kind: 'family' }>;

export function assertFamily(viewer: Viewer, tenantId: string): asserts viewer is FamilyViewer {
  assertViewer(viewer, tenantId);
  if (viewer.kind !== 'family') deny('Sign in with your family account to do this.');
}

export type GuardianPermission = 'submit_attendance' | 'view';

/**
 * The single check for "may this family account act for this child?".
 * Requires an active guardian link with the specific permission, and an
 * active student. Restricted links grant nothing.
 */
export async function guardianLink(tx: Tx, viewer: FamilyViewer, studentId: string, permission: GuardianPermission) {
  if (!UUID.test(studentId)) return null;
  const [row] = await tx
    .select({ s: students, g: studentGuardians })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.membershipId, viewer.membershipId)));
  if (!row || row.g.access !== 'active' || row.s.status !== 'active') return null;
  if (permission === 'submit_attendance' && !row.g.canSubmitAttendance) return null;
  if (permission === 'view' && !row.g.canViewStudent) return null;
  return row;
}

/** Short sequential reference per school (R-1001, R-1002…), safe under concurrency. */
export async function nextInboxNumber(tx: Tx, tenantId: string): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'inbox:' + tenantId}))`);
  const r = await tx.execute<{ n: number }>(sql`SELECT coalesce(max(number), 1000) + 1 AS n FROM inbox_items`);
  return Number(r.rows[0]?.n ?? 1001);
}

export const studentName = (s: { firstName: string; lastName: string; preferredName: string | null }) =>
  `${s.preferredName || s.firstName} ${s.lastName}`;
