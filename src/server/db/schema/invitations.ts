// Staff invitations. The link carries a random token; only its SHA-256 hash is
// stored, so a database leak does not leak usable invitation links.
import { foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';
import { roles, scopeType } from './tenant';

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    title: text('title'),
    roleId: uuid('role_id').notNull(),
    scopeType: scopeType('scope_type').notNull().default('school'),
    scopeId: uuid('scope_id'),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: text('accepted_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invitations_token_uq').on(t.tokenHash),
    index('invitations_tenant_email_idx').on(t.tenantId, t.email),
    foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }).onDelete('cascade'),
  ],
);
