// Students and guardians.
//
// Staff with students.view see students in their grades; students.manage
// (school-wide) adds, edits, imports and links guardians. A guardian link
// joins a family account to a child with explicit permissions; "restricted"
// removes all access (custody orders) and keeps a staff-only note.
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { grades, memberships, studentGuardians, students, user } from '../db/schema';
import { audit } from '../audit/log';
import { can, type AuthzContext } from '../rbac/authorize';
import { ValidationError } from './modules';
import { assertFamily, assertId, assertStaff, deny, gradeScope, studentName, type FamilyViewer } from './ops-common';
import type { Viewer } from '../viewer';
import { directorySource } from './directory';

const name = z.string().trim().min(1, 'Enter a name.').max(80);

export const studentSchema = z.object({
  firstName: name,
  lastName: name,
  preferredName: z.string().trim().max(80).optional().transform((v) => v || null),
  gradeId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  externalId: z.string().trim().max(64).optional().transform((v) => v || null),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const guardianSchema = z.object({
  membershipId: z.string().uuid('Choose a family account.'),
  relationship: z.string().trim().min(1).max(40).default('Parent/guardian'),
  access: z.enum(['active', 'restricted']).default('active'),
  canSubmitAttendance: z.boolean().default(true),
  canViewStudent: z.boolean().default(true),
  restrictionNote: z.string().trim().max(500).optional().transform((v) => v || null),
});

function needView(ctx: AuthzContext) {
  assertStaff(ctx);
  const scope = gradeScope(ctx, 'students.view');
  if (scope !== 'all' && scope.length === 0) deny('Not allowed: students.view');
  return scope;
}
function needManage(ctx: AuthzContext) {
  assertStaff(ctx, { write: true });
  if (!can(ctx, 'students.manage')) deny('Not allowed: students.manage');
}

/** Adding to the manual list only makes sense when the school uses it (Settings → Student records). */
async function needManualList(ctx: AuthzContext, db: Db) {
  if ((await directorySource(ctx.tenantId, db)) !== 'manual')
    throw new ValidationError('The manual student list is switched off. Turn it on in Settings → Student records, or connect FACTS instead.');
}

async function validGrade(tx: Tx, gradeId: string | null) {
  if (!gradeId) return null;
  const [g] = await tx.select({ id: grades.id }).from(grades).where(eq(grades.id, gradeId));
  if (!g) throw new ValidationError('Choose a valid grade.');
  return g.id;
}

export async function listStudents(ctx: AuthzContext, opts: { q?: string; gradeId?: string; includeInactive?: boolean } = {}, db: Db = platformDb()) {
  const scope = needView(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const conds = [];
      if (scope !== 'all') conds.push(inArray(students.gradeId, scope));
      if (opts.gradeId) conds.push(eq(students.gradeId, opts.gradeId));
      if (!opts.includeInactive) conds.push(eq(students.status, 'active'));
      const q = opts.q?.trim().slice(0, 60);
      if (q) {
        const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        conds.push(or(ilike(students.firstName, like), ilike(students.lastName, like), ilike(students.preferredName, like), ilike(students.externalId, like))!);
      }
      const rows = await tx
        .select()
        .from(students)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(students.lastName), asc(students.firstName))
        .limit(1000);
      const counts = rows.length
        ? await tx
            .select({ studentId: studentGuardians.studentId, n: sql<number>`count(*)::int`, restricted: sql<number>`count(*) filter (where access = 'restricted')::int` })
            .from(studentGuardians)
            .where(inArray(studentGuardians.studentId, rows.map((r) => r.id)))
            .groupBy(studentGuardians.studentId)
        : [];
      return rows.map((s) => {
        const c = counts.find((x) => x.studentId === s.id);
        return { ...s, guardians: c?.n ?? 0, restricted: c?.restricted ?? 0 };
      });
    },
    db,
  );
}

export async function getStudent(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  needView(ctx);
  assertId(id, 'Student');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [s] = await tx.select().from(students).where(eq(students.id, id));
      if (!s) throw new ValidationError('Student not found.');
      if (!(s.gradeId ? can(ctx, 'students.view', { gradeIds: [s.gradeId] }) : can(ctx, 'students.view'))) deny('Not allowed: students.view');
      const guardians = await tx
        .select({ g: studentGuardians, name: user.name, email: user.email, status: memberships.status })
        .from(studentGuardians)
        .innerJoin(memberships, eq(memberships.id, studentGuardians.membershipId))
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(studentGuardians.studentId, id))
        .orderBy(asc(user.name));
      const manage = can(ctx, 'students.manage');
      return {
        student: s,
        // The custody note is only for people who manage guardian links.
        guardians: guardians.map((x) => ({ ...x.g, restrictionNote: manage ? x.g.restrictionNote : null, name: x.name, email: x.email, membershipStatus: x.status })),
      };
    },
    db,
  );
}

export async function saveStudent(ctx: AuthzContext, id: string | null, input: unknown, db: Db = platformDb()) {
  needManage(ctx);
  await needManualList(ctx, db);
  const d = studentSchema.parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const gradeId = await validGrade(tx, d.gradeId);
      if (d.externalId) {
        const [dup] = await tx.select({ id: students.id }).from(students).where(eq(students.externalId, d.externalId));
        if (dup && dup.id !== id) throw new ValidationError('Another student already has this SIS id.');
      }
      let row;
      if (id) {
        assertId(id, 'Student');
        [row] = await tx.update(students).set({ ...d, gradeId, updatedAt: new Date() }).where(eq(students.id, id)).returning();
        if (!row) throw new ValidationError('Student not found.');
      } else {
        [row] = await tx.insert(students).values({ ...d, gradeId, tenantId: ctx.tenantId }).returning();
      }
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: id ? 'students.updated' : 'students.created', targetType: 'student', targetId: row!.id });
      return row!;
    },
    db,
  );
}

export async function setGuardian(ctx: AuthzContext, studentId: string, input: unknown, db: Db = platformDb()) {
  needManage(ctx);
  await needManualList(ctx, db);
  assertId(studentId, 'Student');
  const d = guardianSchema.parse(input);
  if (d.access === 'restricted' && !d.restrictionNote) throw new ValidationError('Add a note explaining the restriction (for staff only).');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!s) throw new ValidationError('Student not found.');
      const [m] = await tx.select().from(memberships).where(eq(memberships.id, d.membershipId));
      if (!m || m.kind !== 'family') throw new ValidationError('Choose a family account.');
      const values = { ...d, updatedAt: new Date() };
      await tx
        .insert(studentGuardians)
        .values({ ...values, tenantId: ctx.tenantId, studentId })
        .onConflictDoUpdate({ target: [studentGuardians.studentId, studentGuardians.membershipId], set: values });
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: d.access === 'restricted' ? 'students.guardian_restricted' : 'students.guardian_set',
        targetType: 'student',
        targetId: studentId,
        metadata: { membershipId: d.membershipId, canSubmitAttendance: d.canSubmitAttendance, canViewStudent: d.canViewStudent },
      });
    },
    db,
  );
}

export async function removeGuardian(ctx: AuthzContext, studentId: string, membershipId: string, db: Db = platformDb()) {
  needManage(ctx);
  assertId(studentId, 'Student');
  assertId(membershipId, 'Guardian');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const r = await tx
        .delete(studentGuardians)
        .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.membershipId, membershipId)))
        .returning();
      if (!r.length) throw new ValidationError('Guardian not found.');
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'students.guardian_removed', targetType: 'student', targetId: studentId, metadata: { membershipId } });
    },
    db,
  );
}

/** Family accounts staff can link as guardians. */
export async function familyAccountsForLinking(ctx: AuthzContext, db: Db = platformDb()) {
  needManage(ctx);
  return withTenant(
    ctx.tenantId,
    (tx) =>
      tx
        .select({ id: memberships.id, name: user.name, email: user.email, status: memberships.status })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(memberships.kind, 'family'))
        .orderBy(asc(user.name)),
    db,
  );
}

// ---------- CSV import ----------

/** Minimal CSV parser: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export const IMPORT_COLUMNS = ['first_name', 'last_name', 'grade', 'sis_id', 'guardian_emails'] as const;
const MAX_IMPORT_ROWS = 3000;

/**
 * Adds or updates students from a CSV (matched by sis_id when given, else by
 * name and grade) and links guardians whose family accounts already exist
 * (matched by email). Never removes students or links, and never changes a
 * restricted link.
 */
export async function importStudents(ctx: AuthzContext, csv: string, db: Db = platformDb()) {
  needManage(ctx);
  await needManualList(ctx, db);
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  if (rows.length < 2) throw new ValidationError('The file has no rows. The first row must be the column names.');
  const head = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (k: string) => head.indexOf(k);
  if (col('first_name') < 0 || col('last_name') < 0) throw new ValidationError('The file needs first_name and last_name columns.');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new ValidationError(`Import at most ${MAX_IMPORT_ROWS} students at a time.`);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const gradeRows = await tx.select().from(grades);
      const families = await tx
        .select({ id: memberships.id, email: user.email })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(memberships.kind, 'family'));
      const byEmail = new Map(families.map((f) => [f.email.toLowerCase(), f.id]));
      const existing = await tx.select().from(students);
      const out = { created: 0, updated: 0, linked: 0, problems: [] as string[] };
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]!;
        const get = (k: string) => (col(k) >= 0 ? (r[col(k)] ?? '').trim() : '');
        const line = i + 1;
        const firstName = get('first_name');
        const lastName = get('last_name');
        if (!firstName || !lastName) {
          out.problems.push(`Line ${line}: missing name, skipped.`);
          continue;
        }
        const gradeText = get('grade').toLowerCase();
        const grade = gradeText ? gradeRows.find((g) => g.code.toLowerCase() === gradeText || g.name.toLowerCase() === gradeText) : undefined;
        if (gradeText && !grade) out.problems.push(`Line ${line}: grade "${get('grade')}" not found; saved without a grade.`);
        const externalId = get('sis_id') || null;
        let s = externalId
          ? existing.find((x) => x.externalId === externalId)
          : existing.find((x) => x.firstName.toLowerCase() === firstName.toLowerCase() && x.lastName.toLowerCase() === lastName.toLowerCase() && x.gradeId === (grade?.id ?? null));
        if (s) {
          [s] = await tx
            .update(students)
            .set({ firstName: firstName.slice(0, 80), lastName: lastName.slice(0, 80), gradeId: grade?.id ?? s.gradeId, status: 'active', updatedAt: new Date() })
            .where(eq(students.id, s.id))
            .returning();
          out.updated++;
        } else {
          [s] = await tx
            .insert(students)
            .values({ tenantId: ctx.tenantId, firstName: firstName.slice(0, 80), lastName: lastName.slice(0, 80), gradeId: grade?.id ?? null, externalId: externalId?.slice(0, 64) ?? null })
            .returning();
          existing.push(s!);
          out.created++;
        }
        for (const email of get('guardian_emails').split(/[;\s]+/).filter(Boolean)) {
          const membershipId = byEmail.get(email.toLowerCase());
          if (!membershipId) {
            out.problems.push(`Line ${line}: no family account for ${email}; link it later from the student page.`);
            continue;
          }
          const res = await tx
            .insert(studentGuardians)
            .values({ tenantId: ctx.tenantId, studentId: s!.id, membershipId })
            .onConflictDoNothing()
            .returning();
          if (res.length) out.linked++;
        }
      }
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'students.imported', metadata: { created: out.created, updated: out.updated, linked: out.linked } });
      return out;
    },
    db,
  );
}

// ---------- Family side ----------

/** The children this family account may act for, with what it may do. */
export async function myChildren(tenantId: string, viewer: Viewer, db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  return withTenant(
    tenantId,
    async (tx) => {
      const rows = await tx
        .select({ s: students, g: studentGuardians, grade: grades.name })
        .from(studentGuardians)
        .innerJoin(students, eq(students.id, studentGuardians.studentId))
        .leftJoin(grades, eq(grades.id, students.gradeId))
        .where(and(eq(studentGuardians.membershipId, v.membershipId), eq(studentGuardians.access, 'active'), eq(students.status, 'active')))
        .orderBy(asc(students.firstName));
      return rows
        .filter((r) => r.g.canViewStudent || r.g.canSubmitAttendance)
        .map((r) => ({ id: r.s.id, name: studentName(r.s), grade: r.grade, canSubmitAttendance: r.g.canSubmitAttendance }));
    },
    db,
  );
}
