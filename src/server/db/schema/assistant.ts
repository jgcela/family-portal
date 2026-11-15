// Family Assistant: a signed-in family's private conversations.
//
// Conversations belong to one family account. No staff screen reads them;
// the school sees only counts and costs (ai_questions, without text).
// Anything the assistant prepares (an absence notice, a message to the
// office) is stored as a proposed action and only happens when the family
// presses Send.
import { foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth';
import { tenants } from './platform';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

export const assistantConversations = pgTable(
  'assistant_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('assistant_conversations_tenant_id_uq').on(t.tenantId, t.id), index('assistant_conversations_user_idx').on(t.tenantId, t.userId, t.updatedAt)],
);

export const assistantRole = pgEnum('assistant_role', ['user', 'assistant']);

/** What the page shows under an answer. Built by the server from tool results, never by the model. */
export type AssistantCard =
  | { kind: 'source'; title: string; section: string | null; url: string | null; quote: string }
  | { kind: 'request'; id: string; number: number; subject: string; status: string }
  | { kind: 'action'; actionId: string };

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    conversationId: uuid('conversation_id').notNull(),
    role: assistantRole('role').notNull(),
    content: text('content').notNull(),
    cards: jsonb('cards').$type<AssistantCard[]>().notNull().default(sql`'[]'::jsonb`),
    /** Tool names used for this answer (no arguments, no results). */
    toolsUsed: text('tools_used').array().notNull().default(sql`'{}'::text[]`),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costMicroUsd: integer('cost_micro_usd').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assistant_messages_conv_idx').on(t.tenantId, t.conversationId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.conversationId], foreignColumns: [assistantConversations.tenantId, assistantConversations.id] }).onDelete('cascade'),
  ],
);

export const assistantActionKind = pgEnum('assistant_action_kind', ['absence_notice', 'office_request']);
export const assistantActionStatus = pgEnum('assistant_action_status', ['proposed', 'confirmed', 'dismissed', 'failed']);

export const assistantActions = pgTable(
  'assistant_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    conversationId: uuid('conversation_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: assistantActionKind('kind').notNull(),
    /** Validated input for submitNotice / createFamilyRequest. Checked again when the family presses Send. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Plain-language summary the family reviews before sending. */
    summary: text('summary').notNull(),
    status: assistantActionStatus('status').notNull().default('proposed'),
    /** Reference of what was created (e.g. "R-1042") or the error shown to the family. */
    result: text('result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('assistant_actions_conv_idx').on(t.tenantId, t.conversationId),
    foreignKey({ columns: [t.tenantId, t.conversationId], foreignColumns: [assistantConversations.tenantId, assistantConversations.id] }).onDelete('cascade'),
  ],
);
