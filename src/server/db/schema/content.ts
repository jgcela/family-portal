// Announcements and School Pages (tenant-owned, RLS-protected; see drizzle/0005_*.sql).
// Bodies are Markdown. Raw HTML is never stored or rendered (see server/content/markdown.ts).
import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';
import { contentStatus } from './calendar';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    summary: text('summary'),
    body: text('body').notNull().default(''),
    isUrgent: boolean('is_urgent').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    audienceIds: uuid('audience_ids').array().notNull().default(sql`'{}'::uuid[]`),
    status: contentStatus('status').notNull().default('draft'),
    // Published items are visible from publishAt (null = immediately) until expiresAt.
    publishAt: timestamp('publish_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('announcements_feed_idx').on(t.tenantId, t.status, t.publishAt),
    index('announcements_audiences_idx').using('gin', t.audienceIds),
  ],
);

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    slug: text('slug').notNull(),
    // Working copy (what editors see). The published copy lives in page_versions.
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    showToc: boolean('show_toc').notNull().default(false),
    audienceIds: uuid('audience_ids').array().notNull().default(sql`'{}'::uuid[]`),
    status: contentStatus('status').notNull().default('draft'),
    publishedVersionId: uuid('published_version_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pages_slug_uq').on(t.tenantId, t.slug), unique('pages_tenant_id_uq').on(t.tenantId, t.id)],
);

/** Immutable snapshot written on every publish, so families always see a reviewed copy and history is kept. */
export const pageVersions = pgTable(
  'page_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    pageId: uuid('page_id').notNull(),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    showToc: boolean('show_toc').notNull(),
    publishedByUserId: text('published_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.pageId], foreignColumns: [pages.tenantId, pages.id] }).onDelete('cascade'),
    uniqueIndex('page_versions_uq').on(t.pageId, t.version),
  ],
);
