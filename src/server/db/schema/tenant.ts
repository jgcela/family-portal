// TENANT-OWNED records. Every table here has a NOT NULL tenant_id and is
// protected by row-level security (see drizzle/0001_rls.sql). Application code
// reaches these tables through withTenant(), which runs as the app_tenant role
// with app.tenant_id set for the transaction.
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

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const schoolProfiles = pgTable('school_profiles', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  shortName: text('short_name'),
  tagline: text('tagline'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  country: text('country').default('US'),
  phone: text('phone'),
  email: text('email'),
  websiteUrl: text('website_url'),
  officeHours: text('office_hours'),
  footerText: text('footer_text'),
  // Optional, e.g. parish/diocese. Never required for non-faith schools.
  affiliation: jsonb('affiliation').notNull().default({}),
  socialLinks: jsonb('social_links').notNull().default([]),
  updatedAt: updatedAt(),
});

export const versionStatus = pgEnum('version_status', ['draft', 'published', 'archived']);

// Theme tokens are versioned: one draft and one published version per tenant.
export const themeVersions = pgTable(
  'theme_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    status: versionStatus('status').notNull(),
    tokens: jsonb('tokens').notNull(),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('theme_one_published_uq').on(t.tenantId).where(sql`${t.status} = 'published'`),
    uniqueIndex('theme_one_draft_uq').on(t.tenantId).where(sql`${t.status} = 'draft'`),
  ],
);

export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    label: text('label').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('academic_years_label_uq').on(t.tenantId, t.label),
    uniqueIndex('academic_years_one_current_uq').on(t.tenantId).where(sql`${t.isCurrent}`),
  ],
);

export const gradeLevel = pgEnum('grade_level', ['preschool', 'elementary', 'middle', 'high', 'other']);

export const grades = pgTable(
  'grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    level: gradeLevel('level').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    uniqueIndex('grades_code_uq').on(t.tenantId, t.code),
    // Composite key target so child tables can enforce same-tenant references.
    unique('grades_tenant_id_uq').on(t.tenantId, t.id),
  ],
);

export const audienceKind = pgEnum('audience_kind', ['school', 'level', 'grade', 'classroom', 'staff', 'custom']);

// Audiences decide WHERE content is shown. They are not authorization:
// protected data still requires an authenticated, authorized membership.
export const audiences = pgTable(
  'audiences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    kind: audienceKind('kind').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('audiences_key_uq').on(t.tenantId, t.key),
    unique('audiences_tenant_id_uq').on(t.tenantId, t.id),
  ],
);

export const audienceGrades = pgTable(
  'audience_grades',
  {
    tenantId: tenantId(),
    audienceId: uuid('audience_id').notNull(),
    gradeId: uuid('grade_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.audienceId, t.gradeId] }),
    foreignKey({ columns: [t.tenantId, t.audienceId], foreignColumns: [audiences.tenantId, audiences.id] }).onDelete(
      'cascade',
    ),
    foreignKey({ columns: [t.tenantId, t.gradeId], foreignColumns: [grades.tenantId, grades.id] }).onDelete('cascade'),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // System roles come from templates; their permission sets are not editable.
    isSystem: boolean('is_system').notNull().default(false),
    // The owner role is the only one that may manage ownership/security.
    isOwnerRole: boolean('is_owner_role').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('roles_key_uq').on(t.tenantId, t.key),
    unique('roles_tenant_id_uq').on(t.tenantId, t.id),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    tenantId: tenantId(),
    roleId: uuid('role_id').notNull(),
    permission: text('permission').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permission] }),
    foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }).onDelete('cascade'),
  ],
);

export const membershipStatus = pgEnum('membership_status', ['invited', 'active', 'suspended']);
export const membershipKind = pgEnum('membership_kind', ['staff', 'family']);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: membershipKind('kind').notNull(),
    status: membershipStatus('status').notNull().default('invited'),
    title: text('title'),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('memberships_user_uq').on(t.tenantId, t.userId),
    unique('memberships_tenant_id_uq').on(t.tenantId, t.id),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const scopeType = pgEnum('scope_type', ['school', 'grade', 'audience', 'own']);

// A role granted to a member, optionally narrowed to a grade or audience.
export const membershipRoles = pgTable(
  'membership_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    membershipId: uuid('membership_id').notNull(),
    roleId: uuid('role_id').notNull(),
    scopeType: scopeType('scope_type').notNull().default('school'),
    scopeId: uuid('scope_id'),
    grantedByUserId: text('granted_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('membership_roles_uq')
      .on(t.membershipId, t.roleId, t.scopeType, sql`coalesce(${t.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    foreignKey({ columns: [t.tenantId, t.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }).onDelete(
      'cascade',
    ),
    foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }).onDelete('cascade'),
  ],
);

export const moduleVisibility = pgEnum('module_visibility', ['public', 'families', 'staff']);

// Per-tenant module state. Disabling keeps all module data intact.
export const tenantModules = pgTable(
  'tenant_modules',
  {
    tenantId: tenantId(),
    moduleId: text('module_id').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    config: jsonb('config').notNull().default({}),
    navLabel: text('nav_label'),
    navOrder: integer('nav_order'),
    showInNav: boolean('show_in_nav').notNull().default(true),
    visibility: moduleVisibility('visibility').notNull().default('public'),
    updatedAt: updatedAt(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.moduleId] })],
);

export const navItemKind = pgEnum('nav_item_kind', ['module', 'page', 'url']);

export const navigationItems = pgTable(
  'navigation_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    menu: text('menu').notNull().default('primary'),
    label: text('label').notNull(),
    kind: navItemKind('kind').notNull(),
    target: text('target').notNull(),
    position: integer('position').notNull(),
    visibility: moduleVisibility('visibility').notNull().default('public'),
    opensInNewTab: boolean('opens_in_new_tab').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('navigation_items_menu_idx').on(t.tenantId, t.menu, t.position)],
);

// Homepage layouts are versioned like themes (draft / published / archived),
// which gives "restore a previous published version".
export const homepageVersions = pgTable(
  'homepage_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    status: versionStatus('status').notNull(),
    blocks: jsonb('blocks').notNull(),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('homepage_one_published_uq').on(t.tenantId).where(sql`${t.status} = 'published'`),
    uniqueIndex('homepage_one_draft_uq').on(t.tenantId).where(sql`${t.status} = 'draft'`),
  ],
);

export const tenantSettings = pgTable('tenant_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  // When true, content needs Draft -> In Review -> Approved before publishing.
  requireApproval: boolean('require_approval').notNull().default(false),
  // When true, nobody may approve content they authored (separation of duties).
  independentApproval: boolean('independent_approval').notNull().default(true),
  requireMfaForAdmins: boolean('require_mfa_for_admins').notNull().default(false),
  defaultVisibility: moduleVisibility('default_visibility').notNull().default('public'),
  updatedAt: updatedAt(),
});
