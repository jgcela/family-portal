// School operations: students and their guardians, attendance notices, the
// operations inbox and workflow rules. Every table is tenant-owned and
// protected by row-level security (see 0023_operations_rls.sql).
//
// Access to a child always goes through student_guardians: a family account
// sees or acts for a student only through an active link that grants that
// specific permission. A "restricted" link (custody order, school decision)
// grants nothing, whatever the flags say.
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';
import { grades, memberships } from './tenant';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------- Students ----------

export const studentStatus = pgEnum('student_status', ['active', 'inactive']);

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    preferredName: text('preferred_name'),
    gradeId: uuid('grade_id'),
    /** The student's id in the school's SIS, when known. Used for matching only. */
    externalId: text('external_id'),
    status: studentStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('students_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('students_external_uq').on(t.tenantId, t.externalId).where(sql`external_id IS NOT NULL`),
    index('students_grade_idx').on(t.tenantId, t.gradeId),
    foreignKey({ columns: [t.tenantId, t.gradeId], foreignColumns: [grades.tenantId, grades.id] }).onDelete('set null'),
  ],
);

export const guardianAccess = pgEnum('guardian_access', ['active', 'restricted']);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    relationship: text('relationship').notNull().default('Parent/guardian'),
    access: guardianAccess('access').notNull().default('active'),
    canSubmitAttendance: boolean('can_submit_attendance').notNull().default(true),
    canViewStudent: boolean('can_view_student').notNull().default(true),
    /** Staff-only note (for example, the court order on file). Never shown to families. */
    restrictionNote: text('restriction_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.membershipId] }),
    index('student_guardians_member_idx').on(t.tenantId, t.membershipId),
    foreignKey({ columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }).onDelete('cascade'),
    foreignKey({ columns: [t.tenantId, t.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }).onDelete('cascade'),
  ],
);

// ---------- Operations inbox ----------

export const inboxKind = pgEnum('inbox_kind', ['attendance', 'question', 'request']);
export const inboxStatus = pgEnum('inbox_status', ['new', 'in_progress', 'waiting', 'resolved', 'cancelled']);
export const inboxPriority = pgEnum('inbox_priority', ['low', 'normal', 'high', 'urgent']);

export const inboxItems = pgTable(
  'inbox_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Short public reference shown to families and staff, e.g. "R-1042". */
    number: integer('number').notNull(),
    kind: inboxKind('kind').notNull(),
    status: inboxStatus('status').notNull().default('new'),
    priority: inboxPriority('priority').notNull().default('normal'),
    subject: text('subject').notNull(),
    body: text('body').notNull().default(''),
    /** Family member who started it (null when staff created it). */
    requesterUserId: text('requester_user_id').references(() => user.id, { onDelete: 'set null' }),
    requesterMembershipId: uuid('requester_membership_id'),
    /** Only for students on the school's manual list. SIS students are not stored. */
    studentId: uuid('student_id'),
    /** Which child, as the student directory names it: "manual:<uuid>" or "facts:<id>". */
    studentKey: text('student_key'),
    /** The child's name when the request was made (kept for the office's record). */
    studentName: text('student_name'),
    /** Grade used for scoped staff access. Null = school-wide (needs a school-wide grant). */
    gradeId: uuid('grade_id'),
    assigneeUserId: text('assignee_user_id').references(() => user.id, { onDelete: 'set null' }),
    workflowId: uuid('workflow_id'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** True when a workflow rule finished it without staff work. */
    automated: boolean('automated').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('inbox_items_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('inbox_items_number_uq').on(t.tenantId, t.number),
    index('inbox_items_status_idx').on(t.tenantId, t.status, t.createdAt),
    index('inbox_items_requester_idx').on(t.tenantId, t.requesterUserId),
    foreignKey({ columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }).onDelete('set null'),
  ],
);

export const inboxEventKind = pgEnum('inbox_event_kind', ['created', 'status', 'assigned', 'priority', 'note', 'reply', 'escalated', 'automation']);

export const inboxEvents = pgTable(
  'inbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    itemId: uuid('item_id').notNull(),
    kind: inboxEventKind('kind').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** 'family' | 'staff' | 'system' */
    actorKind: text('actor_kind').notNull(),
    body: text('body').notNull().default(''),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    /** Shown on the family's request page. Internal notes are never visible. */
    visibleToFamily: boolean('visible_to_family').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('inbox_events_item_idx').on(t.tenantId, t.itemId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.itemId], foreignColumns: [inboxItems.tenantId, inboxItems.id] }).onDelete('cascade'),
  ],
);

export const replyTemplates = pgTable('reply_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const inboxViews = pgTable(
  'inbox_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Validated filter object (see services/inbox.ts). */
    filters: jsonb('filters').$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('inbox_views_user_idx').on(t.tenantId, t.userId)],
);

// ---------- Attendance notices ----------

export const attendanceType = pgEnum('attendance_type', ['absent', 'late', 'early_dismissal']);
export const attendanceReason = pgEnum('attendance_reason', ['illness', 'medical_appointment', 'family', 'other']);
export const attendanceStatus = pgEnum('attendance_status', [
  'draft',
  'submitted',
  'received',
  'pending_review',
  'approved',
  'rejected',
  'sis_sync_pending',
  'sis_synced',
  'sync_failed',
  'cancelled',
]);

export const attendanceNotices = pgTable(
  'attendance_notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Only for students on the school's manual list. SIS students are not stored. */
    studentId: uuid('student_id'),
    /** Which child, as the student directory names it: "manual:<uuid>" or "facts:<id>". */
    studentKey: text('student_key').notNull(),
    /** Name and grade when the notice was sent (kept for the office's record). */
    studentName: text('student_name').notNull(),
    gradeId: uuid('grade_id'),
    membershipId: uuid('membership_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: attendanceType('type').notNull(),
    dateFrom: date('date_from').notNull(),
    dateTo: date('date_to').notNull(),
    /** HH:MM, school time zone. Late arrival or early dismissal only. */
    time: text('time'),
    reason: attendanceReason('reason').notNull(),
    comment: text('comment').notNull().default(''),
    status: attendanceStatus('status').notNull().default('submitted'),
    idempotencyKey: text('idempotency_key').notNull(),
    inboxItemId: uuid('inbox_item_id'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Shown to the family when the notice is rejected or needs more information. */
    reviewNote: text('review_note'),
    /** Office confirmed it entered the notice in the SIS by hand (no SIS connection). */
    sisRecordedManuallyAt: timestamp('sis_recorded_manually_at', { withTimezone: true }),
    sisRecordedByUserId: text('sis_recorded_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('attendance_notices_idem_uq').on(t.tenantId, t.userId, t.idempotencyKey),
    index('attendance_notices_student_idx').on(t.tenantId, t.studentKey, t.dateFrom),
    index('attendance_notices_status_idx').on(t.tenantId, t.status, t.dateFrom),
    foreignKey({ columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }).onDelete('cascade'),
    foreignKey({ columns: [t.tenantId, t.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }).onDelete('cascade'),
  ],
);

// ---------- Workflows ----------

export const workflowTrigger = pgEnum('workflow_trigger', ['attendance_notice', 'family_question', 'office_request']);

/**
 * A rule the school switched on from a template. Rules are data, never code:
 * conditions and actions come from a fixed, validated vocabulary (see
 * services/workflows.ts). For each trigger the first matching enabled rule
 * (lowest sort order) applies.
 */
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    templateKey: text('template_key').notNull(),
    name: text('name').notNull(),
    trigger: workflowTrigger('trigger').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(100),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('workflows_trigger_idx').on(t.tenantId, t.trigger, t.sortOrder)],
);

export type Student = typeof students.$inferSelect;
export type StudentGuardian = typeof studentGuardians.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type InboxEvent = typeof inboxEvents.$inferSelect;
export type AttendanceNotice = typeof attendanceNotices.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
