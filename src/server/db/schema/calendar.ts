// Calendar & Events (tenant-owned, RLS-protected; see drizzle/0002_*.sql).
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
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

export const calendarSourceType = pgEnum('calendar_source_type', ['manual', 'ics_url']);

export const calendars = pgTable(
  'calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#1F3A5F'),
    // Shown on the family portal and in the public ICS feed.
    isPublic: boolean('is_public').notNull().default(true),
    sourceType: calendarSourceType('source_type').notNull().default('manual'),
    // For subscribed calendars (ics_url): the feed URL and sync state.
    sourceUrl: text('source_url'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncStatus: text('last_sync_status'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('calendars_key_uq').on(t.tenantId, t.key), unique('calendars_tenant_id_uq').on(t.tenantId, t.id)],
);

export const contentStatus = pgEnum('content_status', ['draft', 'in_review', 'approved', 'published', 'archived']);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    calendarId: uuid('calendar_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    category: text('category'),
    allDay: boolean('all_day').notNull().default(false),
    // All-day events: date range (end inclusive). Timed events: instants.
    startDate: date('start_date'),
    endDate: date('end_date'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    timezone: text('timezone').notNull(),
    // RFC 5545 RRULE body (without "RRULE:"), e.g. FREQ=WEEKLY;BYDAY=FR;UNTIL=20270528
    rrule: text('rrule'),
    exdates: date('exdates').array().notNull().default(sql`'{}'::date[]`),
    registrationUrl: text('registration_url'),
    // Empty = whole school.
    audienceIds: uuid('audience_ids').array().notNull().default(sql`'{}'::uuid[]`),
    isImportant: boolean('is_important').notNull().default(false),
    status: contentStatus('status').notNull().default('draft'),
    // Import identity: stable UID from the source and a hash of its content.
    externalUid: text('external_uid'),
    externalHash: text('external_hash'),
    importId: uuid('import_id'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.calendarId], foreignColumns: [calendars.tenantId, calendars.id] }).onDelete(
      'cascade',
    ),
    uniqueIndex('events_external_uid_uq')
      .on(t.tenantId, t.calendarId, t.externalUid)
      .where(sql`${t.externalUid} is not null`),
    index('events_range_idx').on(t.tenantId, t.startDate, t.startsAt),
    index('events_audiences_idx').using('gin', t.audienceIds),
  ],
);

export const importStatus = pgEnum('import_status', ['previewed', 'completed', 'failed']);

export const calendarImports = pgTable(
  'calendar_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    calendarId: uuid('calendar_id').notNull(),
    sourceKind: text('source_kind').notNull(), // ics_file | csv_file | ics_url
    fileName: text('file_name'),
    status: importStatus('status').notNull(),
    summary: jsonb('summary').notNull().default({}),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.calendarId], foreignColumns: [calendars.tenantId, calendars.id] }).onDelete(
      'cascade',
    ),
  ],
);
