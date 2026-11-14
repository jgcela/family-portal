// Documents: private files with versions and a stable link.
// Bytes go to private object storage; the database keeps metadata only.
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { documents, documentVersions, plans, subscriptions } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, assertCan, can, hasAnywhere, type AuthzContext } from '../rbac/authorize';
import { detectFileKind, sanitizeFileName, storageSafeName } from '../storage/files';
import { getPrivateStorage, TooLargeError, type ObjectStorage } from '../storage/storage';
import { assertViewer, canSee, visibleTo, type Viewer } from '../viewer';
import { ValidationError } from './modules';
import { nextStatus, type Transition } from './workflow';
import { eventResource, gradeLookup, settingsFor } from './scope';
import { MAX_DIRECT_UPLOAD_BYTES, verifyUploadToken } from './uploads';

/** Server actions on Vercel accept about 4.5 MB per request; keep a margin. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentVersionRow = typeof documentVersions.$inferSelect;
/** Either the bytes (small files sent with the form) or a direct-upload token (see uploads.ts). */
export type UploadedFile = { name: string; bytes: Uint8Array } | { name: string; token: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

export const documentInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(SLUG, 'Link name: lowercase letters, numbers and hyphens (max 80).'),
    description: z.string().trim().max(2000).default(''),
    category: z.string().trim().max(60).default(''),
    visibility: z.enum(['public', 'families', 'staff']).default('public'),
    audienceIds: z.array(z.uuid()).max(50).default([]),
  })
  .strict();

function columns(input: unknown) {
  const p = documentInputSchema.safeParse(input);
  if (!p.success) throw new ValidationError(zodMessage(p.error));
  return {
    title: p.data.title,
    slug: p.data.slug,
    description: p.data.description || null,
    category: p.data.category || null,
    audienceIds: [...new Set(p.data.audienceIds)],
    visibility: p.data.visibility,
  };
}

async function load(tx: Tx, id: string): Promise<DocumentRow> {
  if (!UUID.test(id)) throw new ValidationError('Document not found.');
  const [row] = await tx.select().from(documents).where(eq(documents.id, id));
  if (!row) throw new ValidationError('Document not found.');
  return row;
}

async function assertSlugFree(tx: Tx, slug: string, exceptId?: string) {
  const [hit] = await tx.select({ id: documents.id }).from(documents).where(eq(documents.slug, slug));
  if (hit && hit.id !== exceptId) throw new ValidationError(`Another document already uses the link "${slug}".`);
}

/** Bytes used by all versions vs. the plan's limit. */
export async function storageUsage(tx: Tx, tenantId: string) {
  const [used] = await tx
    .select({ bytes: sql<string>`coalesce(sum(${documentVersions.sizeBytes}), 0)` })
    .from(documentVersions)
    .where(eq(documentVersions.tenantId, tenantId));
  const [plan] = await tx
    .select({ mb: plans.storageLimitMb })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantId));
  return { usedBytes: Number(used?.bytes ?? 0), limitBytes: plan ? plan.mb * 1024 * 1024 : 0 };
}

type Checked = { fileName: string; contentType: string; sizeBytes: number; sha256: string; bytes: Uint8Array; storedKey?: string };

/** A direct-upload token used a second time. The object belongs to the first version, so it is never deleted. */
class UploadReusedError extends ValidationError {
  constructor() {
    super('This upload was already used. Choose the file again.');
  }
}

const tooBig = (bytes: number, limit: number) =>
  new ValidationError(`The file is ${(bytes / 1048576).toFixed(1)} MB. The limit is ${limit / 1048576} MB.`);

/** Validates a file before anything is stored. */
export function checkFile(file: { name: string; bytes: Uint8Array }, limit = MAX_UPLOAD_BYTES): Checked {
  if (file.bytes.byteLength > limit) throw tooBig(file.bytes.byteLength, limit);
  const k = detectFileKind(file.name, file.bytes);
  if (!k.ok) throw new ValidationError(k.error);
  return {
    fileName: sanitizeFileName(file.name, k.kind),
    contentType: k.kind.contentType,
    sizeBytes: file.bytes.byteLength,
    sha256: createHash('sha256').update(file.bytes).digest('hex'),
    bytes: file.bytes,
  };
}

/**
 * A directly uploaded file: reads it back from storage and runs the same
 * checks as a file sent with the form. Anything that fails is deleted.
 */
async function checkDirectUpload(ctx: AuthzContext, file: { name: string; token: string }, storage: ObjectStorage): Promise<Checked> {
  const key = verifyUploadToken(ctx, file.token);
  let bytes: Uint8Array | null;
  try {
    bytes = await storage.get(key, MAX_DIRECT_UPLOAD_BYTES);
  } catch (err) {
    if (err instanceof TooLargeError) {
      await storage.delete(key).catch(() => undefined);
      throw tooBig(err.bytes, MAX_DIRECT_UPLOAD_BYTES);
    }
    throw err;
  }
  if (!bytes) throw new ValidationError('The file did not reach storage. Try the upload again.');
  try {
    return { ...checkFile({ name: file.name, bytes }, MAX_DIRECT_UPLOAD_BYTES), storedKey: key };
  } catch (err) {
    await storage.delete(key).catch(() => undefined);
    throw err;
  }
}

/**
 * Stores the bytes, then runs `write` in the tenant transaction. If the
 * database step fails, the stored object is removed again.
 */
async function storeThen<T>(
  ctx: AuthzContext,
  docId: string,
  file: Checked,
  storage: ObjectStorage,
  write: (key: string) => Promise<T>,
): Promise<T> {
  const key = file.storedKey ?? `t/${ctx.tenantId}/documents/${docId}/${randomUUID()}/${storageSafeName(file.fileName)}`;
  if (!file.storedKey) await storage.put(key, file.bytes, file.contentType);
  try {
    return await write(key);
  } catch (err) {
    if (!(err instanceof UploadReusedError)) await storage.delete(key).catch(() => undefined);
    throw err;
  }
}

async function insertVersion(tx: Tx, ctx: AuthzContext, docId: string, key: string, file: Checked) {
  if (file.storedKey) {
    // One direct upload, one version: a token cannot be used twice.
    const [used] = await tx.select({ id: documentVersions.id }).from(documentVersions).where(eq(documentVersions.storageKey, key));
    if (used) throw new UploadReusedError();
  }
  const usage = await storageUsage(tx, ctx.tenantId);
  if (usage.usedBytes + file.sizeBytes > usage.limitBytes) {
    throw new ValidationError(
      `Not enough storage left in your plan (${(usage.usedBytes / 1048576).toFixed(1)} of ${(usage.limitBytes / 1048576).toFixed(0)} MB used).`,
    );
  }
  const [{ v }] = (await tx
    .select({ v: max(documentVersions.version) })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))) as [{ v: number | null }];
  const [ver] = await tx
    .insert(documentVersions)
    .values({
      tenantId: ctx.tenantId,
      documentId: docId,
      version: (v ?? 0) + 1,
      storageKey: key,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      uploadedByUserId: ctx.userId,
    })
    .returning();
  return ver!;
}

export async function createDocument(
  ctx: AuthzContext,
  input: unknown,
  file: UploadedFile,
  opts: { db?: Db; storage?: ObjectStorage } = {},
) {
  assertVerifiedContext(ctx);
  const cols = columns(input);
  const inline = 'bytes' in file ? checkFile(file) : null;
  const db = opts.db ?? platformDb();
  // Permission checks before touching storage.
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      const res = await eventResource(tx, cols.audienceIds, ctx.userId);
      assertCan(ctx, 'documents.create', res);
      assertCan(ctx, 'documents.upload', res);
      await assertSlugFree(tx, cols.slug);
    },
    db,
  );
  const storage = opts.storage ?? getPrivateStorage();
  const checked = inline ?? (await checkDirectUpload(ctx, file as { name: string; token: string }, storage));
  const id = randomUUID();
  return storeThen(ctx, id, checked, storage, (key) =>
    withTenant(
      ctx.tenantId,
      async (tx) => {
        await assertSlugFree(tx, cols.slug);
        await tx.insert(documents).values({ ...cols, id, tenantId: ctx.tenantId, createdByUserId: ctx.userId, updatedByUserId: ctx.userId });
        const ver = await insertVersion(tx, ctx, id, key, checked);
        const [row] = await tx.update(documents).set({ currentVersionId: ver.id }).where(eq(documents.id, id)).returning();
        await audit(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: 'document.created',
          targetType: 'document',
          targetId: id,
          metadata: { fileName: checked.fileName, sizeBytes: checked.sizeBytes },
        });
        return row!;
      },
      db,
    ),
  );
}

export async function updateDocument(ctx: AuthzContext, id: string, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  const cols = columns(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      assertCan(ctx, 'documents.edit', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      const next = await eventResource(tx, cols.audienceIds, cur.createdByUserId);
      assertCan(ctx, 'documents.edit', next);
      // On a live document every change is visible at once, so it needs publish rights.
      if (cur.status === 'published') assertCan(ctx, 'documents.publish', next);
      await assertSlugFree(tx, cols.slug, id);
      const [row] = await tx
        .update(documents)
        .set({ ...cols, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .where(eq(documents.id, id))
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'document.updated', targetType: 'document', targetId: id });
      return row!;
    },
    db,
  );
}

/** Uploads a new file. It becomes the version families get. */
export async function uploadDocumentVersion(
  ctx: AuthzContext,
  id: string,
  file: UploadedFile,
  opts: { db?: Db; storage?: ObjectStorage } = {},
) {
  assertVerifiedContext(ctx);
  const inline = 'bytes' in file ? checkFile(file) : null;
  const db = opts.db ?? platformDb();
  const assertAllowed = async (tx: Tx) => {
    const cur = await load(tx, id);
    const res = await eventResource(tx, cur.audienceIds, cur.createdByUserId);
    assertCan(ctx, 'documents.upload', res);
    assertCan(ctx, 'documents.edit', res);
    if (cur.status === 'published') assertCan(ctx, 'documents.publish', res);
    return cur;
  };
  await withTenant(ctx.tenantId, assertAllowed, db);
  const storage = opts.storage ?? getPrivateStorage();
  const checked = inline ?? (await checkDirectUpload(ctx, file as { name: string; token: string }, storage));
  return storeThen(ctx, id, checked, storage, (key) =>
    withTenant(
      ctx.tenantId,
      async (tx) => {
        await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, id)).for('update');
        await assertAllowed(tx);
        const ver = await insertVersion(tx, ctx, id, key, checked);
        await tx
          .update(documents)
          .set({ currentVersionId: ver.id, updatedByUserId: ctx.userId, updatedAt: new Date() })
          .where(eq(documents.id, id));
        await audit(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: 'document.version_uploaded',
          targetType: 'document',
          targetId: id,
          metadata: { version: ver.version, fileName: checked.fileName, sizeBytes: checked.sizeBytes },
        });
        return ver;
      },
      db,
    ),
  );
}

/** Makes an earlier version the one families get. */
export async function setCurrentDocumentVersion(ctx: AuthzContext, id: string, versionId: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!UUID.test(versionId)) throw new ValidationError('Version not found.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      const res = await eventResource(tx, cur.audienceIds, cur.createdByUserId);
      assertCan(ctx, 'documents.edit', res);
      if (cur.status === 'published') assertCan(ctx, 'documents.publish', res);
      const [ver] = await tx
        .select()
        .from(documentVersions)
        .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, id)));
      if (!ver) throw new ValidationError('Version not found.');
      await tx.update(documents).set({ currentVersionId: ver.id, updatedByUserId: ctx.userId, updatedAt: new Date() }).where(eq(documents.id, id));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'document.version_restored',
        targetType: 'document',
        targetId: id,
        metadata: { version: ver.version },
      });
      return ver;
    },
    db,
  );
}

export async function transitionDocument(ctx: AuthzContext, id: string, action: Transition, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      const res = await eventResource(tx, cur.audienceIds, cur.createdByUserId);
      const status = nextStatus(ctx, 'documents', 'document', cur.status, action, res, await settingsFor(tx, ctx.tenantId));
      if (status === 'published' && !cur.currentVersionId) throw new ValidationError('Upload a file before publishing.');
      const [row] = await tx
        .update(documents)
        .set({
          status,
          publishedAt: status === 'published' ? new Date() : cur.publishedAt,
          updatedByUserId: ctx.userId,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id))
        .returning();
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: `document.${action}`,
        targetType: 'document',
        targetId: id,
        metadata: { from: cur.status, to: status },
      });
      return row!;
    },
    db,
  );
}

/** Deletes the document, all its versions and their stored files. */
export async function deleteDocument(ctx: AuthzContext, id: string, opts: { db?: Db; storage?: ObjectStorage } = {}) {
  assertVerifiedContext(ctx);
  const keys = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      assertCan(ctx, 'documents.delete', await eventResource(tx, cur.audienceIds, cur.createdByUserId));
      const vs = await tx.select({ key: documentVersions.storageKey }).from(documentVersions).where(eq(documentVersions.documentId, id));
      await tx.delete(documents).where(eq(documents.id, id));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'document.deleted',
        targetType: 'document',
        targetId: id,
        metadata: { title: cur.title, versions: vs.length },
      });
      return vs.map((v) => v.key);
    },
    opts.db ?? platformDb(),
  );
  // After the rows are gone nobody can reach the files; removing them is cleanup.
  const storage = opts.storage ?? getPrivateStorage();
  const failed: string[] = [];
  for (const k of keys) await storage.delete(k).catch(() => failed.push(k));
  if (failed.length) console.error(`document ${id}: could not delete ${failed.length} stored file(s)`, failed);
  return { deletedFiles: keys.length - failed.length };
}

// ---------- Reads ----------

export async function listDocumentsForStaff(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'documents.view')) throw new AuthorizationError('Not allowed: documents.view', 'documents.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select({ doc: documents, file: documentVersions })
        .from(documents)
        .leftJoin(documentVersions, eq(documentVersions.id, documents.currentVersionId))
        .orderBy(asc(documents.category), asc(documents.title));
      const gradesOf = await gradeLookup(tx, rows.flatMap((r) => r.doc.audienceIds));
      const usage = await storageUsage(tx, ctx.tenantId);
      return {
        usage,
        items: rows.filter((r) =>
          can(ctx, 'documents.view', { audienceIds: r.doc.audienceIds, gradeIds: gradesOf(r.doc.audienceIds), authorUserId: r.doc.createdByUserId }),
        ),
      };
    },
    db,
  );
}

export async function getDocumentForStaff(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const doc = await load(tx, id);
      const res = await eventResource(tx, doc.audienceIds, doc.createdByUserId);
      assertCan(ctx, 'documents.view', res);
      const versions = await tx
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, id))
        .orderBy(desc(documentVersions.version));
      return { doc, versions, res, settings: await settingsFor(tx, ctx.tenantId) };
    },
    db,
  );
}

export async function listDocumentCategories(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const rows = await tx.selectDistinct({ c: documents.category }).from(documents).orderBy(asc(documents.category));
      return rows.map((r) => r.c).filter((c): c is string => !!c);
    },
    db,
  );
}

export type ResolvedFile = { storageKey: string; fileName: string; contentType: string; version: number; documentId: string };

/**
 * Decides whether this viewer may download the document behind a stable link.
 * - Published, current version: whoever the document's visibility allows
 *   (public, families in its audiences, or staff only).
 * - Drafts, archived documents and older versions: staff with documents.view.
 * Returns null for "not found" so the response never reveals that a private
 * document exists.
 */
export async function resolveDocumentLink(
  tenantId: string,
  slug: string,
  staffCtx: AuthzContext | null,
  opts: { version?: number; moduleActive: boolean; viewer: Viewer },
  db: Db = platformDb(),
): Promise<ResolvedFile | null> {
  assertViewer(opts.viewer, tenantId);
  if (!SLUG.test(slug)) return null;
  return withTenant(
    tenantId,
    async (tx) => {
      const [doc] = await tx.select().from(documents).where(eq(documents.slug, slug));
      if (!doc) return null;
      const res = await eventResource(tx, doc.audienceIds, doc.createdByUserId);
      const staff = !!staffCtx && staffCtx.tenantId === tenantId && can(staffCtx, 'documents.view', res);
      const wantsOld = opts.version !== undefined;
      if (!staff) {
        if (!opts.moduleActive || doc.status !== 'published' || wantsOld || !canSee(doc, opts.viewer)) return null;
      }
      const where = wantsOld
        ? and(eq(documentVersions.documentId, doc.id), eq(documentVersions.version, opts.version!))
        : doc.currentVersionId
          ? eq(documentVersions.id, doc.currentVersionId)
          : null;
      if (!where) return null;
      const [ver] = await tx.select().from(documentVersions).where(where);
      if (!ver) return null;
      return { storageKey: ver.storageKey, fileName: ver.fileName, contentType: ver.contentType, version: ver.version, documentId: doc.id };
    },
    db,
  );
}

/** Titles and links for a set of slugs (used by pages that list documents). */
export async function listPublicDocuments(tenantId: string, viewer: Viewer, db: Db = platformDb()) {
  assertViewer(viewer, tenantId);
  return withTenant(
    tenantId,
    (tx) =>
      tx
        .select({ slug: documents.slug, title: documents.title, category: documents.category, description: documents.description, visibility: documents.visibility, audienceIds: documents.audienceIds, fileName: documentVersions.fileName, contentType: documentVersions.contentType, sizeBytes: documentVersions.sizeBytes, updatedAt: documentVersions.createdAt })
        .from(documents)
        .innerJoin(documentVersions, eq(documentVersions.id, documents.currentVersionId))
        .where(and(eq(documents.status, 'published'), visibleTo(documents, viewer)))
        .orderBy(asc(documents.category), asc(documents.title)),
    db,
  );
}

