// Newsletter archive (School Messenger). Tenant-owned, RLS-protected (see
// drizzle/*_messenger_rls.sql). `html` is always stored already sanitized
// (scripts, forms, frames and event handlers removed) and is only shown inside
// a frame that cannot run scripts.
import { sql } from 'drizzle-orm';
import { boolean, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';
import { moduleVisibility } from './tenant';

export const newsletterIssues = pgTable(
  'newsletter_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    issueDate: date('issue_date').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    highlights: text('highlights').array().notNull().default(sql`'{}'::text[]`),
    html: text('html').notNull(),
    visibility: moduleVisibility('visibility').notNull().default('public'),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('newsletter_issues_date_idx').on(t.tenantId, t.issueDate)],
);
