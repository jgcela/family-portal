// PLATFORM-OWNED records. These are managed by the platform owner and are never
// writable from a tenant (school) context. The runtime tenant role (app_tenant)
// gets at most SELECT on the rows that concern its own tenant.
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';

export const tenantStatus = pgEnum('tenant_status', ['onboarding', 'active', 'suspended', 'archived']);

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: tenantStatus('status').notNull().default('onboarding'),
    timezone: text('timezone').notNull().default('America/Denver'),
    locale: text('locale').notNull().default('en-US'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
  },
  (t) => [uniqueIndex('tenants_slug_uq').on(t.slug)],
);

export const domainKind = pgEnum('domain_kind', ['subdomain', 'custom']);

// Hostnames that resolve to a tenant. Custom domains only resolve once verified.
export const tenantDomains = pgTable(
  'tenant_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    kind: domainKind('kind').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    verificationToken: text('verification_token'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tenant_domains_hostname_uq').on(sql`lower(${t.hostname})`),
    index('tenant_domains_tenant_idx').on(t.tenantId),
  ],
);

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  includedModules: text('included_modules').array().notNull().default(sql`'{}'::text[]`),
  storageLimitMb: integer('storage_limit_mb').notNull(),
  staffUserLimit: integer('staff_user_limit'),
  // Display-only. No payment processing exists yet (see docs/02-arquitectura.md).
  priceCentsPerYear: integer('price_cents_per_year'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'comped',
]);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus('status').notNull().default('trialing'),
    extraModules: text('extra_modules').array().notNull().default(sql`'{}'::text[]`),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    renewsAt: timestamp('renews_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscriptions_tenant_uq').on(t.tenantId)],
);

export const platformRole = pgEnum('platform_role', ['owner', 'operator', 'support']);

// Platform staff. Completely separate from school roles: a school role can never
// grant platform authority and vice versa.
export const platformAdmins = pgTable('platform_admins', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: platformRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Time-limited, scoped, school-approved support access. There is no standing
// "see every tenant" access for platform staff.
export const supportGrants = pgTable(
  'support_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    platformUserId: text('platform_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    scopes: text('scopes').array().notNull(),
    reason: text('reason').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    approvedByUserId: text('approved_by_user_id').references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('support_grants_tenant_idx').on(t.tenantId)],
);

export const actorKind = pgEnum('actor_kind', ['user', 'platform', 'support', 'system']);

// Append-only audit trail. tenant_id NULL = platform-level event.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorKind: actorKind('actor_kind').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorUserId),
  ],
);
