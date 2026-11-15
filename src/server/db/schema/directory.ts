// Student directory: where a family's children come from.
//
// The portal does not keep its own copy of the school's students when the
// school connects its SIS. A family's children are read from the SIS when
// needed (see services/directory.ts); only the connection settings, the
// parent's SIS person id and staff-set access blocks are stored here.
// A school without a connected SIS can switch on the manual student list
// (tables students and student_guardians) instead.
import { index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid, foreignKey } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';
import { memberships } from './tenant';

export const directorySource = pgEnum('directory_source', ['none', 'manual', 'facts', 'oneroster']);
export const directoryStatus = pgEnum('directory_status', ['not_configured', 'connected', 'error']);

export const directorySettings = pgTable('directory_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  /** none: families see no children. manual: the school's own list. facts / oneroster: read live from the SIS. */
  source: directorySource('source').notNull().default('none'),
  /** The school's Facts-Api-Key, encrypted (see crypto/secrets.ts). Never shown again after saving. */
  factsApiKeyEnc: text('facts_api_key_enc'),
  /** Last four characters, so staff can tell which key is saved. */
  factsApiKeyHint: text('facts_api_key_hint'),
  /** OneRoster (PowerSchool, Infinite Campus…): addresses and client ID. Not secret. */
  onerosterConfig: jsonb('oneroster_config').$type<{ version: 'v1p1' | 'v1p2'; baseUrl: string; tokenUrl: string; clientId: string; product: string }>(),
  /** The OneRoster client secret, encrypted. Never shown again after saving. */
  onerosterSecretEnc: text('oneroster_secret_enc'),
  onerosterSecretHint: text('oneroster_secret_hint'),
  /** Status of the last connection test of the selected SIS (columns named before OneRoster existed). */
  factsStatus: directoryStatus('facts_status').notNull().default('not_configured'),
  factsCheckedAt: timestamp('facts_checked_at', { withTimezone: true }),
  factsLastError: text('facts_last_error'),
  /** FACTS grade level → portal grade id, for levels the automatic match misses. */
  gradeMap: jsonb('grade_map').$type<Record<string, string>>().notNull().default({}),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Which SIS person a family account is. Found by email, or set by staff. */
export const sisPersonLinks = pgTable(
  'sis_person_links',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id').notNull(),
    provider: text('provider').notNull(),
    personId: text('person_id').notNull(),
    /** 'email' (found automatically) or 'staff' (set by hand). */
    matchedBy: text('matched_by').notNull(),
    matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.provider] }),
    index('sis_person_links_person_idx').on(t.tenantId, t.provider, t.personId),
    foreignKey({ columns: [t.tenantId, t.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }).onDelete('cascade'),
  ],
);

/**
 * Staff decision that a family account must not act for a child even though
 * the SIS links them (for example, a custody order). Checked on every read.
 * The note is visible only to staff who manage integrations.
 */
export const directoryBlocks = pgTable(
  'directory_blocks',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id').notNull(),
    /** "facts:<id>" */
    studentKey: text('student_key').notNull(),
    note: text('note').notNull(),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.studentKey] }),
    foreignKey({ columns: [t.tenantId, t.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }).onDelete('cascade'),
  ],
);
