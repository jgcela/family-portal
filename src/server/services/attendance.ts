// Attendance notices: families tell the school about an absence, a late
// arrival or an early dismissal; the office reviews it.
//
// States (attendance_status):
//   draft → submitted → received → pending_review → approved | rejected
//   approved → sis_sync_pending → sis_synced | sync_failed (only with a SIS
//   connector that can write attendance; none exists yet, so the office
//   records approved notices in the SIS by hand and marks them here)
//   submitted | received | pending_review | approved → cancelled
//
// Families pick a generic reason; the form asks them not to share medical
// details. Submitting twice with the same key returns the first notice.
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { attendanceNotices, inboxEvents, inboxItems, tenants, type AttendanceNotice } from '../db/schema';
import { audit } from '../audit/log';
import { type AuthzContext } from '../rbac/authorize';
import { addDays, daysBetween, toDateStr } from '../calendar/time';
import { ValidationError } from './modules';
import { activeModuleIds, assertFamily, assertId, assertStaff, canOnGrade, deny, type FamilyViewer } from './ops-common';
import { childFor } from './directory';
import { createInboxItem } from './inbox';
import type { Viewer } from '../viewer';

export type AttendanceStatus = AttendanceNotice['status'];

export const TYPE_LABEL = { absent: 'Absent', late: 'Late arrival', early_dismissal: 'Early dismissal' } as const;
export const REASON_LABEL = { illness: 'Illness', medical_appointment: 'Medical appointment', family: 'Family reason', other: 'Other' } as const;
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  received: 'Received',
  pending_review: 'Being reviewed',
  approved: 'Accepted',
  rejected: 'Not accepted',
  sis_sync_pending: 'Sending to school records',
  sis_synced: 'In school records',
  sync_failed: 'Could not send to school records',
  cancelled: 'Cancelled',
};

/** Every allowed move. Anything else is refused. */
export const TRANSITIONS: Record<AttendanceStatus, AttendanceStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['received', 'cancelled'],
  received: ['pending_review', 'approved', 'rejected', 'cancelled'],
  pending_review: ['approved', 'rejected', 'cancelled'],
  approved: ['sis_sync_pending', 'cancelled'],
  rejected: [],
  sis_sync_pending: ['sis_synced', 'sync_failed'],
  sync_failed: ['sis_sync_pending'],
  sis_synced: [],
  cancelled: [],
};

export function assertTransition(from: AttendanceStatus, to: AttendanceStatus) {
  if (!TRANSITIONS[from].includes(to)) throw new ValidationError(`A notice that is "${STATUS_LABEL[from]}" can't become "${STATUS_LABEL[to]}".`);
}

const MAX_PAST_DAYS = 14;
const MAX_FUTURE_DAYS = 120;
const MAX_SPAN_DAYS = 14;
const DAILY_LIMIT = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const noticeSchema = z
  .object({
    /** A child key from the student directory ("facts:…", "manual:…", or a manual-list id). */
    studentId: z.string().min(1, 'Choose your child.').max(120),
    type: z.enum(['absent', 'late', 'early_dismissal']),
    dateFrom: z.string().regex(DATE, 'Choose a date.'),
    dateTo: z.string().regex(DATE).or(z.literal('')).optional(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 09:30.')
      .or(z.literal(''))
      .optional(),
    reason: z.enum(['illness', 'medical_appointment', 'family', 'other'], { message: 'Choose a reason.' }),
    comment: z.string().trim().max(500, 'Keep the comment under 500 characters.').default(''),
    idempotencyKey: z.string().min(8).max(64),
  })
  .transform((d) => ({ ...d, dateTo: d.type === 'absent' && d.dateTo ? d.dateTo : d.dateFrom, time: d.type === 'absent' ? null : d.time || null }));

async function schoolToday(tenantId: string, now: Date, db: Db) {
  const [t] = await db.select({ tz: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId));
  return toDateStr(now, t?.tz ?? 'America/Denver');
}

/** Checks dates against "today" in the school's time zone. */
export function validateDates(d: { type: string; dateFrom: string; dateTo: string; time: string | null }, today: string) {
  if (d.type !== 'absent' && !d.time) throw new ValidationError(d.type === 'late' ? 'Enter the expected arrival time.' : 'Enter the pick-up time.');
  if (daysBetween(d.dateFrom, d.dateTo) < 0) throw new ValidationError('The last day must be on or after the first day.');
  if (daysBetween(d.dateFrom, d.dateTo) + 1 > MAX_SPAN_DAYS) throw new ValidationError(`For absences longer than ${MAX_SPAN_DAYS} days, please contact the office.`);
  if (d.dateFrom < addDays(today, -MAX_PAST_DAYS)) throw new ValidationError(`Notices can be sent up to ${MAX_PAST_DAYS} days after the absence. Please contact the office.`);
  if (d.dateFrom > addDays(today, MAX_FUTURE_DAYS)) throw new ValidationError('That date is too far ahead. Please contact the office.');
}

export async function submitNotice(tenantId: string, viewer: Viewer, input: unknown, now = new Date(), db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  const mods = await activeModuleIds(tenantId);
  if (!mods.has('attendance_notices')) throw new ValidationError('The school is not taking attendance notices here yet. Please call the office.');
  const d = noticeSchema.parse(input);
  validateDates(d, await schoolToday(tenantId, now, db));
  // Resolve the child first, outside the transaction: it may call the school's SIS.
  // A retry with the same key returns the first notice even if the SIS is slow now.
  const [earlier] = await withTenant(tenantId, (tx) => tx.select().from(attendanceNotices).where(and(eq(attendanceNotices.userId, v.userId), eq(attendanceNotices.idempotencyKey, d.idempotencyKey))), db);
  if (earlier) return { notice: earlier, duplicate: true };
  const child = await childFor(tenantId, v, d.studentId, 'submit_attendance', db);
  if (!child) throw new ValidationError('You can\'t send attendance notices for this child. Please contact the office.');
  return withTenant(
    tenantId,
    async (tx) => {
      // Same key from the same person: return the first notice (double click, retry, back button).
      const [dup] = await tx.select().from(attendanceNotices).where(and(eq(attendanceNotices.userId, v.userId), eq(attendanceNotices.idempotencyKey, d.idempotencyKey)));
      if (dup) return { notice: dup, duplicate: true };
      const since = new Date(now.getTime() - 24 * 3600_000);
      const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(attendanceNotices).where(and(eq(attendanceNotices.userId, v.userId), gte(attendanceNotices.createdAt, since)));
      if ((c?.n ?? 0) >= DAILY_LIMIT) throw new ValidationError('You have sent many notices today. Please call the office.');
      // The same child can't have two open notices of the same kind for overlapping days.
      const [overlap] = await tx
        .select({ id: attendanceNotices.id })
        .from(attendanceNotices)
        .where(
          and(
            eq(attendanceNotices.studentKey, child.key),
            eq(attendanceNotices.type, d.type),
            sql`${attendanceNotices.status} not in ('rejected', 'cancelled')`,
            sql`${attendanceNotices.dateFrom} <= ${d.dateTo}::date and ${attendanceNotices.dateTo} >= ${d.dateFrom}::date`,
          ),
        );
      if (overlap) throw new ValidationError('There is already a notice for this child on those days. Open it from "My requests" to see its status.');

      const [notice] = await tx
        .insert(attendanceNotices)
        .values({
          tenantId,
          studentId: child.studentId,
          studentKey: child.key,
          studentName: child.name,
          gradeId: child.gradeId,
          membershipId: v.membershipId,
          userId: v.userId,
          type: d.type,
          dateFrom: d.dateFrom,
          dateTo: d.dateTo,
          time: d.time,
          reason: d.reason,
          comment: d.comment,
          status: 'submitted',
          idempotencyKey: d.idempotencyKey,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const days = daysBetween(d.dateFrom, d.dateTo) + 1;
      const when = d.dateFrom === d.dateTo ? d.dateFrom : `${d.dateFrom} to ${d.dateTo}`;
      const { item, automated } = await createInboxItem(tx, {
        tenantId,
        kind: 'attendance',
        trigger: 'attendance_notice',
        facts: { type: d.type, reason: d.reason, days },
        subject: `${TYPE_LABEL[d.type]}: ${child.name}, ${when}${d.time ? ` at ${d.time}` : ''}`,
        body: `${REASON_LABEL[d.reason]}${d.comment ? `\n\n${d.comment}` : ''}`,
        requesterUserId: v.userId,
        requesterMembershipId: v.membershipId,
        student: { key: child.key, name: child.name, studentId: child.studentId },
        gradeId: child.gradeId,
        now,
      });
      assertTransition('submitted', 'received');
      let status: AttendanceStatus = 'received';
      if (automated) {
        assertTransition('received', 'approved');
        status = 'approved';
      }
      const [saved] = await tx
        .update(attendanceNotices)
        .set({ status, inboxItemId: item.id, reviewedAt: automated ? now : null, updatedAt: now })
        .where(eq(attendanceNotices.id, notice!.id))
        .returning();
      await audit(tx, { tenantId, actorUserId: v.userId, action: 'attendance.submitted', targetType: 'attendance_notice', targetId: notice!.id, metadata: { type: d.type, days, automated } });
      return { notice: saved!, duplicate: false };
    },
    db,
  );
}

/** Families can cancel until the last day of the notice has passed. */
export async function cancelNotice(tenantId: string, viewer: Viewer, noticeId: string, now = new Date(), db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  assertId(noticeId, 'Notice');
  const today = await schoolToday(tenantId, now, db);
  return withTenant(
    tenantId,
    async (tx) => {
      const [n] = await tx.select().from(attendanceNotices).where(and(eq(attendanceNotices.id, noticeId), eq(attendanceNotices.userId, v.userId))).for('update');
      if (!n) throw new ValidationError('Notice not found.');
      if (n.dateTo < today) throw new ValidationError('This notice is in the past. Please contact the office to change it.');
      assertTransition(n.status, 'cancelled');
      await setNoticeStatus(tx, tenantId, n, 'cancelled', { actorUserId: v.userId, actorKind: 'family', now, itemStatus: 'cancelled', familyMessage: 'Cancelled by the family.' });
      await audit(tx, { tenantId, actorUserId: v.userId, action: 'attendance.cancelled', targetType: 'attendance_notice', targetId: n.id });
    },
    db,
  );
}

async function setNoticeStatus(
  tx: Tx,
  tenantId: string,
  n: AttendanceNotice,
  to: AttendanceStatus,
  o: { actorUserId: string | null; actorKind: 'family' | 'staff' | 'system'; now: Date; itemStatus?: 'in_progress' | 'resolved' | 'cancelled'; familyMessage?: string; review?: { note: string | null } },
) {
  await tx
    .update(attendanceNotices)
    .set({
      status: to,
      updatedAt: o.now,
      ...(o.review ? { reviewedByUserId: o.actorUserId, reviewedAt: o.now, reviewNote: o.review.note } : {}),
    })
    .where(eq(attendanceNotices.id, n.id));
  if (!n.inboxItemId) return;
  const [item] = await tx.select().from(inboxItems).where(eq(inboxItems.id, n.inboxItemId)).for('update');
  if (!item) return;
  const set: Partial<typeof inboxItems.$inferInsert> = { updatedAt: o.now };
  if (o.itemStatus && o.itemStatus !== item.status) {
    set.status = o.itemStatus;
    set.resolvedAt = o.itemStatus === 'resolved' ? o.now : null;
  }
  if (o.actorKind === 'staff' && !item.firstResponseAt && o.familyMessage) set.firstResponseAt = o.now;
  await tx.update(inboxItems).set(set).where(eq(inboxItems.id, item.id));
  await tx.insert(inboxEvents).values({
    tenantId,
    itemId: item.id,
    kind: 'status',
    actorUserId: o.actorUserId,
    actorKind: o.actorKind,
    fromValue: n.status,
    toValue: to,
    body: o.familyMessage ?? '',
    visibleToFamily: true,
    createdAt: o.now,
  });
}

async function loadForReview(tx: Tx, ctx: AuthzContext, noticeId: string) {
  assertId(noticeId, 'Notice');
  const [n] = await tx.select().from(attendanceNotices).where(eq(attendanceNotices.id, noticeId)).for('update');
  if (!n) throw new ValidationError('Notice not found.');
  const [item] = n.inboxItemId ? await tx.select({ gradeId: inboxItems.gradeId }).from(inboxItems).where(eq(inboxItems.id, n.inboxItemId)) : [];
  if (!canOnGrade(ctx, 'attendance.review', item?.gradeId ?? null)) deny('Not allowed: attendance.review');
  return n;
}

export async function reviewNotice(ctx: AuthzContext, noticeId: string, action: 'start' | 'approve' | 'reject' | 'cancel', note: string | null, now = new Date(), db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  const msg = (note ?? '').trim().slice(0, 500) || null;
  if (action === 'reject' && !msg) throw new ValidationError('Tell the family why, so they know what to do next.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const n = await loadForReview(tx, ctx, noticeId);
      const to: AttendanceStatus = action === 'start' ? 'pending_review' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled';
      assertTransition(n.status, to);
      const familyMessage =
        action === 'approve' ? msg ?? 'Accepted by the school.' : action === 'reject' ? msg! : action === 'cancel' ? msg ?? 'Cancelled by the school.' : 'The office is reviewing your notice.';
      await setNoticeStatus(tx, ctx.tenantId, n, to, {
        actorUserId: ctx.userId,
        actorKind: 'staff',
        now,
        itemStatus: action === 'start' ? 'in_progress' : action === 'cancel' ? 'cancelled' : 'resolved',
        familyMessage,
        review: action === 'start' ? undefined : { note: msg },
      });
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: `attendance.${action === 'start' ? 'review_started' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'}`, targetType: 'attendance_notice', targetId: n.id });
    },
    db,
  );
}

/**
 * Manual fallback while there is no SIS connection: the office confirms it
 * typed the accepted notice into the SIS. This does not change the notice
 * state to "In school records", which is reserved for a verified connector.
 */
export async function markRecordedInSis(ctx: AuthzContext, noticeId: string, now = new Date(), db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const n = await loadForReview(tx, ctx, noticeId);
      if (n.status !== 'approved') throw new ValidationError('Only accepted notices can be marked as entered in the SIS.');
      if (n.sisRecordedManuallyAt) throw new ValidationError('Already marked as entered in the SIS.');
      await tx.update(attendanceNotices).set({ sisRecordedManuallyAt: now, sisRecordedByUserId: ctx.userId, updatedAt: now }).where(eq(attendanceNotices.id, n.id));
      if (n.inboxItemId) {
        await tx.insert(inboxEvents).values({ tenantId: ctx.tenantId, itemId: n.inboxItemId, kind: 'note', actorUserId: ctx.userId, actorKind: 'staff', body: 'Entered in the SIS by hand.', visibleToFamily: false, createdAt: now });
      }
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'attendance.sis_recorded_manually', targetType: 'attendance_notice', targetId: n.id });
    },
    db,
  );
}
