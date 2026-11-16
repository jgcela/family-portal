// School Knowledge AI: sources, ingestion and the school's AI settings.
//
// Pipeline for each source: read the authorized content (portal record, file
// in private storage, or text written by staff) → extract text and sections →
// chunk → store chunks with the school's tenant id and the content's
// visibility → full-text index (generated tsvector column). A content hash
// decides when to reindex; removing a source or unpublishing its record
// deletes its chunks. Only approved sources are used for answers.
import { LOCAL_OR_HTTPS } from '@/lib/safe-next';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import {
  aiQuestions,
  aiSettings,
  announcements,
  documents,
  documentVersions,
  knowledgeChunks,
  knowledgeSources,
  pages,
  pageVersions,
  volunteerOpportunities,
  type EscalationContact,
  assistantConversations,
} from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { assertCan, AuthorizationError, can, type AuthzContext } from '../rbac/authorize';
import { ValidationError } from '../errors';
import { getModuleState } from './modules';
import { usageFor } from '../billing/entitlements';
import { chunkSections } from '../ai/chunk';
import { extractSections, markdownToSections, pastedToSections, UnsupportedFormatError, type Section } from '../ai/extract';
import { getPrivateStorage, type ObjectStorage } from '../storage/storage';

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
type Visibility = 'public' | 'families' | 'staff';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Sources indexed per run, so one request never runs for minutes. */
export const INDEX_BATCH = 15;

export const TOPICS = [
  ['general', 'General'],
  ['handbook', 'Parent handbook'],
  ['policy', 'School policies'],
  ['calendar', 'Calendar and events'],
  ['newsletter', 'Newsletters and announcements'],
  ['staff', 'Staff directory'],
  ['enrollment', 'Enrollment'],
  ['uniform', 'Uniform'],
  ['dropoff_pickup', 'Drop-off and pick-up'],
  ['lunch', 'Lunch'],
  ['volunteer', 'Volunteering'],
  ['attendance', 'Attendance'],
  ['tuition', 'Tuition and fees'],
  ['health', 'Health and safety'],
  ['faq', 'Approved FAQ'],
] as const;
export type Topic = (typeof TOPICS)[number][0];
const TOPIC_IDS = TOPICS.map((t) => t[0]) as [Topic, ...Topic[]];

const TOPIC_WORDS: [Topic, RegExp][] = [
  ['handbook', /handbook/i],
  ['uniform', /uniform|dress code|polo|shoes/i],
  ['lunch', /lunch|cafeteria|milk|hot meal|menu/i],
  ['dropoff_pickup', /drop[- ]?off|pick[- ]?up|carpool|car line|dismissal|arrival/i],
  ['enrollment', /enrol|admission|registration|re-?register|apply/i],
  ['volunteer', /volunteer|service hours/i],
  ['attendance', /absen|tardy|late arrival|attendance|sick/i],
  ['tuition', /tuition|fee|payment|facts billing/i],
  ['health', /health|nurse|medication|allerg|vaccin|immuniz/i],
  ['staff', /staff|directory|teacher list|faculty/i],
  ['calendar', /calendar|schedule|holiday|no school|break|events?\b/i],
  ['newsletter', /newsletter|messenger|announcement|update/i],
  ['policy', /polic|rule|code of conduct|discipline/i],
];

/** Best-effort topic from a title or question; staff can change it. */
export function guessTopic(text: string): Topic {
  for (const [t, re] of TOPIC_WORDS) if (re.test(text)) return t;
  return 'general';
}

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

async function entitledOrThrow(tenantId: string, db: Db) {
  const st = await getModuleState(tenantId, db);
  if (!st.entitled.has('knowledge_ai')) throw new AuthorizationError('The School Knowledge AI is not included in this school\'s plan.');
  return st;
}

function hash(v: unknown) {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex');
}

// ---------- Discovery (sync with portal content) ----------

/**
 * Creates pending sources for published portal content that has none,
 * refreshes titles, links and visibility of linked sources, and retires
 * sources whose record was deleted. Never approves anything by itself.
 */
export async function discoverSources(tx: Tx, tenantId: string, userId: string | null, enabledModules: Set<string>) {
  const existing = await tx.select().from(knowledgeSources);
  const byRef = new Map(existing.filter((s) => s.refId).map((s) => [`${s.kind}:${s.refId}`, s]));
  let created = 0;
  let retired = 0;

  type Linked = { kind: 'document' | 'page' | 'announcement'; id: string; title: string; url: string; visibility: Visibility; audienceIds: string[]; live: boolean };
  const linked: Linked[] = [];
  if (enabledModules.has('documents')) {
    for (const d of await tx.select().from(documents))
      linked.push({ kind: 'document', id: d.id, title: d.title, url: `/d/${d.slug}`, visibility: d.visibility, audienceIds: d.audienceIds, live: d.status === 'published' && !!d.currentVersionId });
  }
  if (enabledModules.has('pages')) {
    for (const p of await tx.select().from(pages))
      linked.push({ kind: 'page', id: p.id, title: p.title, url: `/p/${p.slug}`, visibility: p.visibility, audienceIds: p.audienceIds, live: p.status === 'published' && !!p.publishedVersionId });
  }
  if (enabledModules.has('announcements')) {
    const now = new Date();
    for (const a of await tx.select().from(announcements))
      linked.push({
        kind: 'announcement',
        id: a.id,
        title: a.title,
        url: `/updates/${a.id}`,
        visibility: a.visibility,
        audienceIds: a.audienceIds,
        live: a.status === 'published' && (!a.publishAt || a.publishAt <= now) && (!a.expiresAt || a.expiresAt > now),
      });
  }
  const seen = new Set<string>();
  for (const r of linked) {
    const key = `${r.kind}:${r.id}`;
    seen.add(key);
    const src = byRef.get(key);
    if (!src) {
      if (!r.live) continue;
      await tx.insert(knowledgeSources).values({
        tenantId,
        kind: r.kind,
        refId: r.id,
        title: r.title,
        url: r.url,
        topic: r.kind === 'announcement' ? 'newsletter' : guessTopic(r.title),
        visibility: r.visibility,
        audienceIds: r.audienceIds,
        createdByUserId: userId,
      });
      created++;
      continue;
    }
    if (src.status === 'removed') continue;
    const sameVis = src.visibility === r.visibility && src.audienceIds.join() === r.audienceIds.join();
    if (src.title !== r.title || src.url !== r.url || !sameVis) {
      await tx
        .update(knowledgeSources)
        .set({ title: r.title, url: r.url, visibility: r.visibility, audienceIds: r.audienceIds, updatedAt: new Date() })
        .where(eq(knowledgeSources.id, src.id));
      // Chunks carry the visibility too: reindex so they match.
      if (!sameVis) await markForReindex(tx, src.id);
    }
    if (!r.live && src.chunkCount > 0) {
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, src.id));
      await tx.update(knowledgeSources).set({ chunkCount: 0, indexStatus: 'waiting', contentHash: null, updatedAt: new Date() }).where(eq(knowledgeSources.id, src.id));
    } else if (r.live && src.indexStatus !== 'indexed' && src.indexStatus !== 'unsupported') {
      await markForReindex(tx, src.id);
    }
  }
  // Records that no longer exist: retire their sources and drop the index.
  for (const s of existing) {
    if (!s.refId || s.status === 'removed' || seen.has(`${s.kind}:${s.refId}`)) continue;
    if (!enabledModules.has(s.kind === 'document' ? 'documents' : s.kind === 'page' ? 'pages' : 'announcements')) continue;
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, s.id));
    await tx
      .update(knowledgeSources)
      .set({ status: 'removed', chunkCount: 0, indexStatus: 'waiting', contentHash: null, indexError: 'The portal item was deleted.', updatedAt: new Date() })
      .where(eq(knowledgeSources.id, s.id));
    retired++;
  }
  // Live sources: one per school.
  for (const [kind, mod, title, url, topic] of [
    ['calendar', 'calendar', 'School calendar', '/calendar', 'calendar'],
    ['volunteer', 'volunteer', 'Volunteer opportunities', '/volunteer', 'volunteer'],
  ] as const) {
    if (!enabledModules.has(mod) || existing.some((s) => s.kind === kind)) continue;
    await tx.insert(knowledgeSources).values({
      tenantId,
      kind,
      title,
      url,
      topic,
      visibility: kind === 'calendar' ? 'public' : 'families',
      indexStatus: kind === 'calendar' ? 'live' : 'waiting',
      createdByUserId: userId,
    });
    created++;
  }
  return { created, retired };
}

async function markForReindex(tx: Tx, id: string) {
  await tx.update(knowledgeSources).set({ indexStatus: 'waiting', updatedAt: new Date() }).where(eq(knowledgeSources.id, id));
}

// ---------- Indexing ----------

type Extracted = { sections: Section[]; chunkVisibility?: { visibility: Visibility; audienceIds: string[] }[] } | { unsupported: string } | { gone: true };

async function readSource(tx: Tx, s: KnowledgeSource, storage: ObjectStorage): Promise<Extracted> {
  switch (s.kind) {
    case 'faq': {
      const body = s.body ?? '';
      return { sections: markdownToSections(body, s.title) };
    }
    case 'text':
      return { sections: pastedToSections(s.body ?? '').map((x) => ({ heading: x.heading ?? s.title, text: x.text })) };
    case 'page': {
      const [p] = await tx.select().from(pages).where(eq(pages.id, s.refId!));
      if (!p?.publishedVersionId || p.status !== 'published') return { gone: true };
      const [v] = await tx.select().from(pageVersions).where(eq(pageVersions.id, p.publishedVersionId));
      if (!v) return { gone: true };
      return { sections: markdownToSections(v.body, v.title) };
    }
    case 'announcement': {
      const [a] = await tx.select().from(announcements).where(eq(announcements.id, s.refId!));
      if (!a || a.status !== 'published') return { gone: true };
      const date = (a.publishedAt ?? a.createdAt).toISOString().slice(0, 10);
      return { sections: markdownToSections(`${a.summary ? `${a.summary}\n\n` : ''}${a.body}`, `${a.title} (posted ${date})`) };
    }
    case 'document': {
      const [row] = await tx
        .select({ d: documents, v: documentVersions })
        .from(documents)
        .innerJoin(documentVersions, eq(documentVersions.id, documents.currentVersionId))
        .where(eq(documents.id, s.refId!));
      if (!row || row.d.status !== 'published') return { gone: true };
      const bytes = await storage.get(row.v.storageKey, MAX_FILE_BYTES);
      if (!bytes) throw new Error('The file is missing from storage.');
      try {
        const sections = await extractSections(bytes, row.v.contentType);
        const intro = row.d.description ? [{ heading: row.d.title, text: row.d.description }] : [];
        return { sections: [...intro, ...sections] };
      } catch (err) {
        if (err instanceof UnsupportedFormatError) return { unsupported: err.message };
        throw err;
      }
    }
    case 'volunteer': {
      const rows = await tx
        .select()
        .from(volunteerOpportunities)
        .where(eq(volunteerOpportunities.status, 'published'))
        .orderBy(asc(volunteerOpportunities.sortOrder), asc(volunteerOpportunities.title));
      const sections: Section[] = [];
      const vis: { visibility: Visibility; audienceIds: string[] }[] = [];
      for (const o of rows) {
        const lines = [
          o.summary,
          o.organizer && `Organizer: ${o.organizer}`,
          o.schedule && `When: ${o.schedule}`,
          o.location && `Where: ${o.location}`,
          o.commitment && `Commitment: ${o.commitment}`,
          o.body,
          ...o.actions.map((x) => `${x.label}: ${x.url}`),
        ].filter(Boolean);
        sections.push({ heading: o.title, text: lines.join('\n\n') });
        vis.push({ visibility: o.visibility, audienceIds: o.audienceIds });
      }
      return { sections, chunkVisibility: vis };
    }
    case 'calendar':
      return { sections: [] };
  }
}

/** Indexes one source inside the caller's transaction. */
export async function indexSource(tx: Tx, s: KnowledgeSource, storage: ObjectStorage = getPrivateStorage()) {
  if (s.kind === 'calendar') {
    await tx.update(knowledgeSources).set({ indexStatus: 'live', indexError: null, indexedAt: new Date() }).where(eq(knowledgeSources.id, s.id));
    return;
  }
  let ex: Extracted;
  try {
    ex = await readSource(tx, s, storage);
  } catch (err) {
    await tx
      .update(knowledgeSources)
      .set({ indexStatus: 'failed', indexError: (err as Error).message.slice(0, 300), updatedAt: new Date() })
      .where(eq(knowledgeSources.id, s.id));
    return;
  }
  if ('gone' in ex) {
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, s.id));
    await tx.update(knowledgeSources).set({ chunkCount: 0, contentHash: null, indexStatus: 'waiting', indexError: 'Not published.' }).where(eq(knowledgeSources.id, s.id));
    return;
  }
  if ('unsupported' in ex) {
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, s.id));
    await tx.update(knowledgeSources).set({ chunkCount: 0, contentHash: null, indexStatus: 'unsupported', indexError: ex.unsupported }).where(eq(knowledgeSources.id, s.id));
    return;
  }
  const rows: { heading: string | null; content: string; visibility: Visibility; audienceIds: string[] }[] = [];
  ex.sections.forEach((sec, i) => {
    const vis = ex.chunkVisibility?.[i] ?? { visibility: s.visibility, audienceIds: s.audienceIds };
    for (const c of chunkSections([sec])) rows.push({ ...c, ...vis });
  });
  const contentHash = hash({ rows, v: s.visibility, a: s.audienceIds });
  const now = new Date();
  if (contentHash === s.contentHash && s.indexStatus === 'indexed') {
    await tx.update(knowledgeSources).set({ indexedAt: now }).where(eq(knowledgeSources.id, s.id));
    return;
  }
  await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, s.id));
  if (rows.length) {
    await tx.insert(knowledgeChunks).values(rows.map((r, ordinal) => ({ tenantId: s.tenantId, sourceId: s.id, ordinal, ...r })));
  }
  await tx
    .update(knowledgeSources)
    .set({
      indexStatus: rows.length ? 'indexed' : 'failed',
      indexError: rows.length ? null : 'No readable text was found. A scanned PDF needs to be converted to text first.',
      contentHash,
      contentUpdatedAt: s.contentHash && s.contentHash !== contentHash ? now : (s.contentUpdatedAt ?? now),
      indexedAt: now,
      chunkCount: rows.length,
      charCount: rows.reduce((n, r) => n + r.content.length, 0),
      updatedAt: now,
    })
    .where(eq(knowledgeSources.id, s.id));
}

/**
 * Discovers new portal content and indexes up to INDEX_BATCH sources that
 * are waiting. Linked sources indexed more than a day ago are rechecked so
 * edited documents and pages are reindexed. Returns how many still wait.
 */
export async function refreshKnowledge(
  tenantId: string,
  opts: { userId?: string | null; storage?: ObjectStorage; recheckAfterMs?: number } = {},
  db: Db = platformDb(),
) {
  const st = await getModuleState(tenantId, db);
  if (!st.entitled.has('knowledge_ai')) return { created: 0, retired: 0, indexed: 0, waiting: 0 };
  const enabled = new Set(st.active.map((m) => m.id));
  return withTenant(
    tenantId,
    async (tx) => {
      const d = await discoverSources(tx, tenantId, opts.userId ?? null, enabled);
      const recheck = new Date(Date.now() - (opts.recheckAfterMs ?? 24 * 3600 * 1000));
      const due = await tx
        .select()
        .from(knowledgeSources)
        .where(
          and(
            sql`${knowledgeSources.status} <> 'removed'`,
            sql`(${knowledgeSources.indexStatus} = 'waiting' OR (${knowledgeSources.indexStatus} IN ('indexed', 'failed') AND (${knowledgeSources.indexedAt} IS NULL OR ${knowledgeSources.indexedAt} < ${recheck})))`,
          ),
        )
        .orderBy(asc(knowledgeSources.indexedAt))
        .limit(INDEX_BATCH + 1);
      const batch = due.slice(0, INDEX_BATCH);
      for (const s of batch) await indexSource(tx, s, opts.storage);
      const [w] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(knowledgeSources)
        .where(and(eq(knowledgeSources.indexStatus, 'waiting'), sql`${knowledgeSources.status} <> 'removed'`));
      await purgeOldQuestions(tx, tenantId);
      return { ...d, indexed: batch.length, waiting: w?.n ?? 0 };
    },
    db,
  );
}

/** Deletes questions older than the school's retention period. */
export async function purgeOldQuestions(tx: Tx, tenantId: string) {
  const s = await settingsRow(tx, tenantId);
  const cutoff = new Date(Date.now() - s.retentionDays * 24 * 3600 * 1000);
  await tx.delete(aiQuestions).where(lt(aiQuestions.createdAt, cutoff));
  // Family Assistant conversations follow the same retention, counted from their last message.
  await tx.delete(assistantConversations).where(lt(assistantConversations.updatedAt, cutoff));
}

// ---------- Staff actions on sources ----------

const textSourceSchema = z
  .object({
    kind: z.enum(['faq', 'text']),
    title: z.string().trim().min(1, 'Title is required.').max(200),
    body: z.string().trim().min(1, 'Write the content.').max(200_000),
    topic: z.enum(TOPIC_IDS).default('general'),
    visibility: z.enum(['public', 'families', 'staff']).default('families'),
    audienceIds: z.array(z.uuid()).max(50).default([]),
    authoritative: z.boolean().default(false),
    effectiveDate: z.union([z.literal(''), z.iso.date()]).default(''),
    reviewBy: z.union([z.literal(''), z.iso.date()]).default(''),
    url: z.union([z.literal(''), z.string().trim().max(500).regex(LOCAL_OR_HTTPS, 'Link: start with / or https://')]).default(''),
  })
  .strict();

const sourceUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(200_000).optional(),
    topic: z.enum(TOPIC_IDS).optional(),
    visibility: z.enum(['public', 'families', 'staff']).optional(),
    audienceIds: z.array(z.uuid()).max(50).optional(),
    authoritative: z.boolean().optional(),
    effectiveDate: z.union([z.literal(''), z.iso.date()]).optional(),
    reviewBy: z.union([z.literal(''), z.iso.date()]).optional(),
    url: z.union([z.literal(''), z.string().trim().max(500).regex(LOCAL_OR_HTTPS, 'Link: start with / or https://')]).optional(),
  })
  .strict();

async function loadSource(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new ValidationError('Source not found.');
  const [s] = await tx.select().from(knowledgeSources).where(eq(knowledgeSources.id, id));
  if (!s) throw new ValidationError('Source not found.');
  return s;
}

/** An FAQ entry or pasted text (HTML or plain). Starts as pending until approved. */
export async function createTextSource(ctx: AuthzContext, input: unknown, opts: { storage?: ObjectStorage } = {}, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.knowledge.manage');
  await entitledOrThrow(ctx.tenantId, db);
  const p = textSourceSchema.safeParse(input);
  if (!p.success) throw new ValidationError(zodMessage(p.error));
  const v = p.data;
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [s] = await tx
        .insert(knowledgeSources)
        .values({
          tenantId: ctx.tenantId,
          kind: v.kind,
          title: v.title,
          body: v.body,
          topic: v.kind === 'faq' && v.topic === 'general' ? 'faq' : v.topic,
          visibility: v.visibility,
          audienceIds: [...new Set(v.audienceIds)],
          authoritative: v.authoritative,
          effectiveDate: v.effectiveDate || null,
          reviewBy: v.reviewBy || null,
          url: v.url || null,
          createdByUserId: ctx.userId,
        })
        .returning();
      await indexSource(tx, s!, opts.storage);
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'knowledge.source_created', targetType: 'knowledge_source', targetId: s!.id, metadata: { kind: v.kind, title: v.title } });
      return s!;
    },
    db,
  );
}

export async function updateSource(ctx: AuthzContext, id: string, input: unknown, opts: { storage?: ObjectStorage } = {}, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.knowledge.manage');
  const p = sourceUpdateSchema.safeParse(input);
  if (!p.success) throw new ValidationError(zodMessage(p.error));
  const v = p.data;
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const s = await loadSource(tx, id);
      const own = s.kind === 'faq' || s.kind === 'text';
      if (!own && (v.body !== undefined || v.visibility !== undefined || v.audienceIds !== undefined || v.title !== undefined || v.url !== undefined)) {
        throw new ValidationError('Edit this item where it lives in the portal; its text, title and visibility come from there.');
      }
      const set: Partial<KnowledgeSource> = { updatedAt: new Date() };
      if (v.title !== undefined) set.title = v.title;
      if (v.body !== undefined) set.body = v.body;
      if (v.topic !== undefined) set.topic = v.topic;
      if (v.visibility !== undefined) set.visibility = v.visibility;
      if (v.audienceIds !== undefined) set.audienceIds = [...new Set(v.audienceIds)];
      if (v.authoritative !== undefined) set.authoritative = v.authoritative;
      if (v.effectiveDate !== undefined) set.effectiveDate = v.effectiveDate || null;
      if (v.reviewBy !== undefined) set.reviewBy = v.reviewBy || null;
      if (v.url !== undefined) set.url = v.url || null;
      const [next] = await tx.update(knowledgeSources).set(set).where(eq(knowledgeSources.id, id)).returning();
      if (own && (v.body !== undefined || v.title !== undefined || v.visibility !== undefined || v.audienceIds !== undefined)) await indexSource(tx, next!, opts.storage);
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'knowledge.source_updated', targetType: 'knowledge_source', targetId: id, metadata: { fields: Object.keys(v) } });
      return next!;
    },
    db,
  );
}

/**
 * approve: the AI may use it (it must be indexed or live first).
 * remove: the AI stops using it at once and its index is deleted.
 * pending: back to "suggested", not used.
 */
export async function setSourceStatus(ctx: AuthzContext, ids: string[], status: 'approved' | 'removed' | 'pending', db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.knowledge.manage');
  if (!ids.length || ids.length > 200 || ids.some((i) => !UUID.test(i))) throw new ValidationError('Choose sources first.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx.select().from(knowledgeSources).where(inArray(knowledgeSources.id, ids));
      const skipped: string[] = [];
      for (const s of rows) {
        if (status === 'approved' && s.indexStatus !== 'indexed' && s.indexStatus !== 'live') {
          skipped.push(s.title);
          continue;
        }
        if (status === 'removed') await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, s.id));
        await tx
          .update(knowledgeSources)
          .set({
            status,
            ...(status === 'approved' ? { approvedByUserId: ctx.userId, approvedAt: new Date() } : {}),
            ...(status === 'removed' ? { chunkCount: 0, contentHash: null, indexStatus: s.kind === 'calendar' ? 'live' : 'waiting' } : {}),
            ...(status === 'pending' && s.status === 'removed' && s.kind !== 'calendar' ? { indexStatus: 'waiting' } : {}),
            updatedAt: new Date(),
          })
          .where(eq(knowledgeSources.id, s.id));
        await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: `knowledge.source_${status}`, targetType: 'knowledge_source', targetId: s.id, metadata: { title: s.title } });
      }
      return { changed: rows.length - skipped.length, skipped };
    },
    db,
  );
}

/** Deletes an FAQ or pasted-text source for good (linked sources can only be removed). */
export async function deleteTextSource(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.knowledge.manage');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const s = await loadSource(tx, id);
      if (s.kind !== 'faq' && s.kind !== 'text') throw new ValidationError('Only FAQ and pasted text can be deleted. Remove the others instead.');
      await tx.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'knowledge.source_deleted', targetType: 'knowledge_source', targetId: id, metadata: { title: s.title } });
    },
    db,
  );
}

// ---------- Settings ----------

export type AiSettings = typeof aiSettings.$inferSelect;

export async function settingsRow(tx: Tx, tenantId: string): Promise<AiSettings> {
  const [row] = await tx.select().from(aiSettings).where(eq(aiSettings.tenantId, tenantId));
  return (
    row ?? {
      tenantId,
      familiesEnabled: false,
      publicEnabled: false,
      escalationContacts: [],
      retentionDays: 180,
      storeQuestionText: true,
      updatedByUserId: null,
      updatedAt: new Date(0),
    }
  );
}

const settingsSchema = z
  .object({
    familiesEnabled: z.boolean(),
    publicEnabled: z.boolean(),
    retentionDays: z.coerce.number().int().min(7, 'Keep questions at least 7 days.').max(730, 'At most 2 years.'),
    storeQuestionText: z.boolean(),
    escalationContacts: z
      .array(
        z
          .object({
            topic: z.enum(TOPIC_IDS),
            name: z.string().trim().min(1, 'Contact name is required.').max(100),
            email: z.email('Enter a valid email.').max(200),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();

export async function getAiSettings(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.knowledge.manage');
  return withTenant(ctx.tenantId, (tx) => settingsRow(tx, ctx.tenantId), db);
}

export async function updateAiSettings(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.settings.manage');
  await entitledOrThrow(ctx.tenantId, db);
  const p = settingsSchema.safeParse(input);
  if (!p.success) throw new ValidationError(zodMessage(p.error));
  const v = p.data;
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      if (v.familiesEnabled || v.publicEnabled) {
        const [ok] = await tx.select({ n: sql<number>`count(*)::int` }).from(knowledgeSources).where(eq(knowledgeSources.status, 'approved'));
        if (!ok?.n) throw new ValidationError('Approve at least one source and test it in the sandbox before turning the assistant on.');
      }
      const before = await settingsRow(tx, ctx.tenantId);
      const row = { ...v, escalationContacts: v.escalationContacts as EscalationContact[], updatedByUserId: ctx.userId, updatedAt: new Date() };
      await tx.insert(aiSettings).values({ tenantId: ctx.tenantId, ...row }).onConflictDoUpdate({ target: aiSettings.tenantId, set: row });
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'ai.settings_changed',
        targetType: 'ai_settings',
        metadata: { from: { familiesEnabled: before.familiesEnabled, publicEnabled: before.publicEnabled, retentionDays: before.retentionDays, storeQuestionText: before.storeQuestionText }, to: { familiesEnabled: v.familiesEnabled, publicEnabled: v.publicEnabled, retentionDays: v.retentionDays, storeQuestionText: v.storeQuestionText } },
      });
      if (v.retentionDays < before.retentionDays) await purgeOldQuestions(tx, ctx.tenantId);
    },
    db,
  );
}

// ---------- Dashboard reads ----------

export type SourceHealth = 'stale' | 'review_due' | 'ok';

/** Stale: review date passed, or the content has not changed in over a year. */
export function sourceHealth(s: Pick<KnowledgeSource, 'reviewBy' | 'contentUpdatedAt' | 'effectiveDate' | 'kind'>, today: string): SourceHealth {
  if (s.kind === 'calendar') return 'ok';
  if (s.reviewBy && s.reviewBy < today) return 'review_due';
  const updated = s.contentUpdatedAt ?? (s.effectiveDate ? new Date(`${s.effectiveDate}T00:00:00Z`) : null);
  if (updated && Date.now() - updated.getTime() > 365 * 24 * 3600 * 1000) return 'stale';
  return 'ok';
}

export async function getKnowledgeDashboard(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.knowledge.manage');
  const st = await getModuleState(ctx.tenantId, db);
  const entitled = st.entitled.has('knowledge_ai');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const sources = await tx.select().from(knowledgeSources).orderBy(asc(knowledgeSources.status), asc(knowledgeSources.title));
      const settings = await settingsRow(tx, ctx.tenantId);
      const quota = await usageFor(tx, ctx.tenantId, 'aiQuestionsPerMonth');
      const today = new Date().toISOString().slice(0, 10);
      return {
        entitled,
        moduleActive: st.active.some((m) => m.id === 'knowledge_ai'),
        sources: sources.map((s) => ({ ...s, health: sourceHealth(s, today) })),
        settings,
        quota,
      };
    },
    db,
  );
}

/** Quality report without any question text: outcomes and unanswered topics. */
export async function getQualityReport(ctx: AuthzContext, days = 30, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!can(ctx, 'ai.quality.review') && !can(ctx, 'ai.knowledge.manage')) {
    throw new AuthorizationError('Not allowed: ai.quality.review', 'ai.quality.review');
  }
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const outcomes = await tx
        .select({ channel: aiQuestions.channel, outcome: aiQuestions.outcome, n: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${aiQuestions.costMicroUsd}), 0)::int`, latency: sql<number>`coalesce(avg(${aiQuestions.latencyMs}), 0)::int` })
        .from(aiQuestions)
        .where(sql`${aiQuestions.createdAt} >= ${since}`)
        .groupBy(aiQuestions.channel, aiQuestions.outcome);
      const unanswered = await tx
        .select({ topic: aiQuestions.topic, n: sql<number>`count(*)::int` })
        .from(aiQuestions)
        .where(and(sql`${aiQuestions.createdAt} >= ${since}`, eq(aiQuestions.channel, 'portal'), inArray(aiQuestions.outcome, ['no_answer', 'error'])))
        .groupBy(aiQuestions.topic)
        .orderBy(desc(sql`count(*)`));
      const topics = await tx
        .select({ topic: aiQuestions.topic, n: sql<number>`count(*)::int` })
        .from(aiQuestions)
        .where(and(sql`${aiQuestions.createdAt} >= ${since}`, eq(aiQuestions.channel, 'portal')))
        .groupBy(aiQuestions.topic)
        .orderBy(desc(sql`count(*)`))
        .limit(10);
      const helpful = await tx
        .select({ feedback: aiQuestions.feedback, n: sql<number>`count(*)::int` })
        .from(aiQuestions)
        .where(and(sql`${aiQuestions.createdAt} >= ${since}`, isNotNull(aiQuestions.feedback)))
        .groupBy(aiQuestions.feedback);
      const failing = await tx.select().from(knowledgeSources).where(and(inArray(knowledgeSources.indexStatus, ['failed', 'unsupported']), sql`${knowledgeSources.status} <> 'removed'`));
      return { days, outcomes, unanswered, topics, helpful, failingSources: failing };
    },
    db,
  );
}

/**
 * Question text for quality review. Owner-only permission, and every read is
 * written to the activity log with the reason given.
 */
export async function readQuestionLog(ctx: AuthzContext, reason: string, opts: { limit?: number; outcome?: 'no_answer' | 'answered' } = {}, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'ai.conversations.review');
  const why = reason.trim();
  if (why.length < 5) throw new ValidationError('Say why you need to read the questions (at least a few words).');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .select({ id: aiQuestions.id, createdAt: aiQuestions.createdAt, channel: aiQuestions.channel, viewerKind: aiQuestions.viewerKind, question: aiQuestions.question, answer: aiQuestions.answer, outcome: aiQuestions.outcome, topic: aiQuestions.topic, feedback: aiQuestions.feedback })
        .from(aiQuestions)
        .where(and(eq(aiQuestions.channel, 'portal'), opts.outcome ? eq(aiQuestions.outcome, opts.outcome) : undefined))
        .orderBy(desc(aiQuestions.createdAt))
        .limit(Math.min(opts.limit ?? 50, 200));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'ai.question_log_read', targetType: 'ai_questions', metadata: { reason: why.slice(0, 300), rows: rows.length } });
      return rows;
    },
    db,
  );
}
