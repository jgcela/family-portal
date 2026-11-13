// Family accounts. A family is a membership of kind 'family'; the grades it
// belongs to decide which audience-limited content it sees. Families join by
// requesting access with the school's code; the office approves each request.
import { foreignKey, index, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth';
import { tenants } from './platform';
import { grades, memberships } from './tenant';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

export const familyGrades = pgTable(
  'family_grades',
  {
    tenantId: tenantId(),
    membershipId: uuid('membership_id').notNull(),
    gradeId: uuid('grade_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.gradeId] }),
    foreignKey({ columns: [t.tenantId, t.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }).onDelete('cascade'),
    foreignKey({ columns: [t.tenantId, t.gradeId], foreignColumns: [grades.tenantId, grades.id] }).onDelete('cascade'),
  ],
);

export const familyRequestStatus = pgEnum('family_request_status', ['pending', 'approved', 'rejected']);

export const familyRequests = pgTable(
  'family_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gradeIds: uuid('grade_ids').array().notNull().default(sql`'{}'::uuid[]`),
    // What the family tells the office so it can check who they are (children's names, etc.).
    note: text('note').notNull().default(''),
    status: familyRequestStatus('status').notNull().default('pending'),
    decidedByUserId: text('decided_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One open request per person per school.
    uniqueIndex('family_requests_pending_uq').on(t.tenantId, t.userId).where(sql`status = 'pending'`),
    index('family_requests_status_idx').on(t.tenantId, t.status),
  ],
);
