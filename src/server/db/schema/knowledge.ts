// School Knowledge AI. Each school has its own sources, chunks and logs; all
// tables are tenant-owned and protected by row-level security, so there is no
// shared index across schools. A source is only used for answers once a staff
// member approves it.
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
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
import { moduleVisibility } from './tenant';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

/**
 * document / page / announcement: linked to a portal record (ref_id); the text
 * is read from that record and its visibility is re-checked on every answer.
 * calendar / volunteer: one per school, read live from the portal.
 * faq / text: written or pasted by staff in the Knowledge dashboard.
 */
export const knowledgeSourceKind = pgEnum('knowledge_source_kind', ['document', 'page', 'announcement', 'calendar', 'volunteer', 'faq', 'text']);
export const knowledgeSourceStatus = pgEnum('knowledge_source_status', ['pending', 'approved', 'removed']);
export const knowledgeIndexStatus = pgEnum('knowledge_index_status', ['waiting', 'indexed', 'failed', 'unsupported', 'live']);

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    kind: knowledgeSourceKind('kind').notNull(),
    refId: uuid('ref_id'),
    title: text('title').notNull(),
    /** Topic used for reports and escalation routing (handbook, uniform, lunch…). */
    topic: text('topic').notNull().default('general'),
    /** Link shown next to answers (portal path such as /p/handbook or /d/slug). */
    url: text('url'),
    /** Text for faq and text sources. Linked sources read their record instead. */
    body: text('body'),
    status: knowledgeSourceStatus('status').notNull().default('pending'),
    /** Authoritative sources win when two sources disagree. */
    authoritative: boolean('authoritative').notNull().default(false),
    effectiveDate: date('effective_date'),
    /** After this date the source is flagged as stale in the dashboard. */
    reviewBy: date('review_by'),
    visibility: moduleVisibility('visibility').notNull().default('public'),
    audienceIds: uuid('audience_ids').array().notNull().default(sql`'{}'::uuid[]`),
    indexStatus: knowledgeIndexStatus('index_status').notNull().default('waiting'),
    indexError: text('index_error'),
    contentHash: text('content_hash'),
    /** Changes when the indexed content changes (reindexing). */
    contentUpdatedAt: timestamp('content_updated_at', { withTimezone: true }),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    chunkCount: integer('chunk_count').notNull().default(0),
    charCount: integer('char_count').notNull().default(0),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    approvedByUserId: text('approved_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('knowledge_sources_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('knowledge_sources_ref_uq').on(t.tenantId, t.kind, t.refId).where(sql`ref_id IS NOT NULL`),
    uniqueIndex('knowledge_sources_singleton_uq').on(t.tenantId, t.kind).where(sql`kind IN ('calendar', 'volunteer')`),
    index('knowledge_sources_status_idx').on(t.tenantId, t.status),
  ],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    sourceId: uuid('source_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    /** Section name or page number, shown as "Relevant section". */
    heading: text('heading'),
    content: text('content').notNull(),
    /** Per-chunk visibility (volunteer opportunities differ); also limited by the source. */
    visibility: moduleVisibility('visibility').notNull().default('public'),
    audienceIds: uuid('audience_ids').array().notNull().default(sql`'{}'::uuid[]`),
    tsv: tsvector('tsv')
      .notNull()
      .generatedAlwaysAs(sql`setweight(to_tsvector('english', coalesce(heading, '')), 'A') || setweight(to_tsvector('english', content), 'B')`),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.sourceId], foreignColumns: [knowledgeSources.tenantId, knowledgeSources.id] }).onDelete('cascade'),
    index('knowledge_chunks_source_idx').on(t.sourceId),
    index('knowledge_chunks_tsv_idx').using('gin', t.tsv),
  ],
);

export type EscalationContact = { topic: string; name: string; email: string };

export const aiSettings = pgTable('ai_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  /** Signed-in families can ask. Off until the school has tested in the sandbox. */
  familiesEnabled: boolean('families_enabled').notNull().default(false),
  /** Visitors who are not signed in can ask (public sources only). */
  publicEnabled: boolean('public_enabled').notNull().default(false),
  escalationContacts: jsonb('escalation_contacts').$type<EscalationContact[]>().notNull().default(sql`'[]'::jsonb`),
  /** Questions and answers are deleted after this many days. */
  retentionDays: integer('retention_days').notNull().default(180),
  /** When false, only the outcome and topic are kept, not the question text. */
  storeQuestionText: boolean('store_question_text').notNull().default(true),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiChannel = pgEnum('ai_channel', ['sandbox', 'portal', 'family_assistant']);
export const aiOutcome = pgEnum('ai_outcome', ['answered', 'no_answer', 'search_only', 'blocked', 'error']);

export const aiQuestions = pgTable(
  'ai_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    channel: aiChannel('channel').notNull(),
    viewerKind: text('viewer_kind').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Hash of the visitor's IP, for rate limits on anonymous questions. */
    ipHash: text('ip_hash'),
    question: text('question'),
    answer: text('answer'),
    outcome: aiOutcome('outcome').notNull(),
    topic: text('topic').notNull().default('unknown'),
    sourceIds: uuid('source_ids').array().notNull().default(sql`'{}'::uuid[]`),
    citedSourceIds: uuid('cited_source_ids').array().notNull().default(sql`'{}'::uuid[]`),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costMicroUsd: integer('cost_micro_usd').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    feedback: text('feedback'),
    escalated: boolean('escalated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_questions_created_idx').on(t.tenantId, t.createdAt), index('ai_questions_user_idx').on(t.tenantId, t.userId, t.createdAt)],
);
