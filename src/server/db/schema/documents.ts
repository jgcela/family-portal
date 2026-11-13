// Documents: files with immutable versions and a stable link (/d/<slug>).
// Bytes live in private object storage (R2); the database only keeps metadata.
// Families get a file through the stable link, which checks access and then
// redirects to a short-lived signed URL. Storage URLs are never stored or shown.
import { sql } from 'drizzle-orm';
import { bigint, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './platform';
import { moduleVisibility } from './tenant';
import { contentStatus } from './calendar';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category'),
    audienceIds: uuid('audience_ids').array().notNull().default(sql`'{}'::uuid[]`),
    // Who can see it once published: public (anyone), families (signed-in families
    // in the audiences, or all families if none) or staff only.
    visibility: moduleVisibility('visibility').notNull().default('public'),
    status: contentStatus('status').notNull().default('draft'),
    /** The version families receive. Null until the first upload. */
    currentVersionId: uuid('current_version_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('documents_slug_uq').on(t.tenantId, t.slug),
    unique('documents_tenant_id_uq').on(t.tenantId, t.id),
    index('documents_audiences_idx').using('gin', t.audienceIds),
  ],
);

/** One uploaded file. Immutable: a new upload is a new version. */
export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    documentId: uuid('document_id').notNull(),
    version: integer('version').notNull(),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    uploadedByUserId: text('uploaded_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.documentId], foreignColumns: [documents.tenantId, documents.id] }).onDelete('cascade'),
    uniqueIndex('document_versions_uq').on(t.documentId, t.version),
    uniqueIndex('document_versions_key_uq').on(t.storageKey),
    index('document_versions_tenant_idx').on(t.tenantId),
  ],
);
