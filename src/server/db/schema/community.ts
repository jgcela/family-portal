// Community modules (tenant-owned, RLS-protected; see drizzle/*_volunteer_rls.sql).
// Text fields are plain text or Markdown. Raw HTML is never stored or rendered.
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';
import { moduleVisibility } from './tenant';
import { contentStatus } from './calendar';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

/** A button on an opportunity: sign-up page, email or phone. */
export type ActionLink = { label: string; url: string };

export const volunteerOpportunities = pgTable(
  'volunteer_opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    // Short facts shown on the card.
    category: text('category'),
    organizer: text('organizer'),
    location: text('location'),
    schedule: text('schedule'),
    commitment: text('commitment'),
    summary: text('summary'),
    // Longer details (Markdown).
    body: text('body').notNull().default(''),
    actions: jsonb('actions').$type<ActionLink[]>().notNull().default(sql`'[]'::jsonb`),
    audienceIds: uuid('audience_ids').array().notNull().default(sql`'{}'::uuid[]`),
    // Contact details of volunteers are often personal: families only by default.
    visibility: moduleVisibility('visibility').notNull().default('families'),
    status: contentStatus('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('volunteer_list_idx').on(t.tenantId, t.status, t.sortOrder), index('volunteer_audiences_idx').using('gin', t.audienceIds)],
);
