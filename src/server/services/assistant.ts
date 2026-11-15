// School Knowledge AI: answering a question.
//
// 1. The server decides who is asking (verified viewer) and whether the
//    assistant is on for them. The model never decides access.
// 2. Retrieval runs inside the school's row-level-security transaction and
//    only returns approved sources the viewer may see, re-checking the live
//    portal record (published, visibility, audience) for linked sources.
// 3. The model gets those passages only. Its citations are verified against
//    the passage text; an answer without a verified citation is not shown.
// 4. Every question is logged with outcome, topic, tokens and cost. Question
//    text is kept only if the school allows it, and deleted after retention.
import { createHash } from 'node:crypto';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { aiQuestions, announcements, documents, knowledgeChunks, knowledgeSources, pages, schoolProfiles, tenants } from '../db/schema';
import { assertVerifiedContext } from '../rbac/context';
import { assertCan, AuthorizationError, type AuthzContext } from '../rbac/authorize';
import { ValidationError } from '../errors';
import { assertViewer, visibleTo, type Viewer } from '../viewer';
import { getModuleState } from './modules';
import { guessTopic, settingsRow } from './knowledge';
import { consume, QuotaExceededError } from '../billing/entitlements';
import { getAiProvider, type Passage } from '../ai/provider';
import { listPublicOccurrences } from './calendar';
import { addDays, toDateStr } from '../calendar/time';
import { formatRange } from '@/lib/when';

export const MAX_QUESTION = 500;
/** Questions per person (or per anonymous IP) in RATE_WINDOW_MS. */
export const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const TOP_K = 8;

const STOP = new Set(
  'a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our please should so tell than that the their them then there these they this to us was we what when where which who why will with would you your'.split(' '),
);

/** Lexemes for an OR query. Only letters and digits reach to_tsquery. */
export function queryTerms(q: string): string[] {
  const words = q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[a-z0-9]{2,}/g);
  return [...new Set((words ?? []).filter((w) => !STOP.has(w)))].slice(0, 16);
}

export type Citation = { sourceId: string; title: string; section: string | null; url: string | null; effectiveDate: string | null; quote: string };
export type SearchHit = { sourceId: string; title: string; section: string | null; url: string | null; excerpt: string };
export type AskResult =
  | { outcome: 'answered'; answer: string; citations: Citation[]; questionId: string | null }
  | { outcome: 'no_answer'; message: string; escalation: { name: string; email: string } | null; questionId: string | null }
  | { outcome: 'search_only'; message: string; hits: SearchHit[]; questionId: string | null };

type Retrieved = {
  chunkId: string;
  sourceId: string;
  heading: string | null;
  content: string;
  title: string;
  url: string | null;
  topic: string;
  authoritative: boolean;
  effectiveDate: string | null;
  score: number;
};

/** Optional live-record check: linked sources must still be published and visible. */
function liveRecordVisible(viewer: Viewer) {
  const docVis = visibleTo(documents, viewer);
  const pageVis = visibleTo(pages, viewer);
  const annVis = visibleTo(announcements, viewer);
  return and(
    sql`(${knowledgeSources.kind} <> 'document' OR (${documents.id} IS NOT NULL AND ${documents.status} = 'published' AND ${docVis ?? sql`true`}))`,
    sql`(${knowledgeSources.kind} <> 'page' OR (${pages.id} IS NOT NULL AND ${pages.status} = 'published' AND ${pageVis ?? sql`true`}))`,
    sql`(${knowledgeSources.kind} <> 'announcement' OR (${announcements.id} IS NOT NULL AND ${announcements.status} = 'published'
      AND (${announcements.publishAt} IS NULL OR ${announcements.publishAt} <= now())
      AND (${announcements.expiresAt} IS NULL OR ${announcements.expiresAt} > now()) AND ${annVis ?? sql`true`}))`,
  );
}

export async function retrieve(tx: Tx, viewer: Viewer, question: string, statuses: ('approved' | 'pending')[], limit = TOP_K): Promise<Retrieved[]> {
  const terms = queryTerms(question);
  if (!terms.length) return [];
  const loose = sql`to_tsquery('english', ${terms.join(' | ')})`;
  const strict = sql`plainto_tsquery('english', ${terms.join(' ')})`;
  const score = sql<number>`(ts_rank_cd(${knowledgeChunks.tsv}, ${loose}, 1) + CASE WHEN ${knowledgeChunks.tsv} @@ ${strict} THEN 0.5 ELSE 0 END) * CASE WHEN ${knowledgeSources.authoritative} THEN 1.5 ELSE 1 END`;
  const rows = await tx
    .select({
      chunkId: knowledgeChunks.id,
      sourceId: knowledgeSources.id,
      heading: knowledgeChunks.heading,
      content: knowledgeChunks.content,
      title: knowledgeSources.title,
      url: knowledgeSources.url,
      topic: knowledgeSources.topic,
      authoritative: knowledgeSources.authoritative,
      effectiveDate: knowledgeSources.effectiveDate,
      score,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeChunks.sourceId))
    .leftJoin(documents, and(eq(knowledgeSources.kind, 'document'), eq(documents.id, knowledgeSources.refId)))
    .leftJoin(pages, and(eq(knowledgeSources.kind, 'page'), eq(pages.id, knowledgeSources.refId)))
    .leftJoin(announcements, and(eq(knowledgeSources.kind, 'announcement'), eq(announcements.id, knowledgeSources.refId)))
    .where(
      and(
        sql`${knowledgeChunks.tsv} @@ ${loose}`,
        inArray(knowledgeSources.status, statuses),
        visibleTo(knowledgeSources, viewer),
        visibleTo(knowledgeChunks, viewer),
        liveRecordVisible(viewer),
      ),
    )
    .orderBy(desc(score))
    .limit(limit);
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

const DATEISH = /\b(today|tomorrow|tonight|week|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|when|date|day off|no school|holiday|break|vacation|mass|game|event|half day|early dismissal)\b/i;

/** Upcoming events for this viewer, as one passage. Only when the calendar source is approved. */
async function calendarPassage(tenantId: string, viewer: Viewer, question: string, tz: string, db: Db): Promise<{ text: string; url: string } | null> {
  const today = toDateStr(new Date(), tz);
  const terms = queryTerms(question);
  let occ;
  try {
    occ = await listPublicOccurrences(tenantId, viewer, { from: addDays(today, -7), to: addDays(today, 120) }, {}, db);
  } catch {
    return null;
  }
  const matches = occ.filter((o) => {
    const hay = `${o.title} ${o.description ?? ''} ${o.category ?? ''} ${o.location ?? ''}`.toLowerCase();
    return terms.some((t) => t.length > 2 && hay.includes(t));
  });
  const soon = DATEISH.test(question) ? occ.filter((o) => o.date >= today && o.date <= addDays(today, 21)) : [];
  const pick = [...new Map([...matches, ...soon].map((o) => [`${o.eventId}:${o.date}`, o])).values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30);
  if (!pick.length) return null;
  const lines = pick.map((o) => `- ${formatRange(o, tz, { year: true })}: ${o.title}${o.location ? ` (${o.location})` : ''}${o.description ? ` — ${o.description.slice(0, 200)}` : ''}`);
  return { text: `Events on the school calendar (times in ${tz}):\n${lines.join('\n')}`, url: '/calendar' };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}'"$%:/.-]+/gu, ' ')
    .trim();

/** A citation counts only if its quote really appears in the passage it names. */
export function verifyCitations(citations: { source: number; quote: string }[], passages: { n: number; text: string }[]) {
  const out: { source: number; quote: string }[] = [];
  for (const c of citations) {
    const p = passages.find((x) => x.n === c.source);
    const q = norm(c.quote);
    if (!p || q.length < 8) continue;
    if (norm(p.text).includes(q)) out.push({ source: c.source, quote: c.quote.trim().slice(0, 300) });
  }
  return out;
}

function ipHash(tenantId: string, ip: string | null | undefined) {
  if (!ip) return null;
  return createHash('sha256').update(`${tenantId}:${ip}:${process.env.BETTER_AUTH_SECRET ?? ''}`).digest('hex').slice(0, 32);
}

async function rateLimited(tx: Tx, userId: string | null, ip: string | null) {
  if (!userId && !ip) return false;
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(aiQuestions)
    .where(and(gt(aiQuestions.createdAt, since), userId ? eq(aiQuestions.userId, userId) : eq(aiQuestions.ipHash, ip!)));
  return (r?.n ?? 0) >= RATE_LIMIT;
}

export class AssistantUnavailableError extends Error {
  readonly status = 403;
  constructor(message = 'The school assistant is not available here.') {
    super(message);
    this.name = 'AssistantUnavailableError';
  }
}

export type AskInput = {
  tenantId: string;
  viewer: Viewer;
  question: string;
  ip?: string | null;
  /** Sandbox only: staff testing before the assistant is on for families. */
  sandbox?: { ctx: AuthzContext; includePending: boolean };
};

export async function askSchool(input: AskInput, db: Db = platformDb()): Promise<AskResult> {
  const { tenantId, viewer } = input;
  assertViewer(viewer, tenantId);
  const question = input.question.replace(/\s+/g, ' ').trim();
  if (question.length < 3) throw new ValidationError('Type a question.');
  if (question.length > MAX_QUESTION) throw new ValidationError(`Keep the question under ${MAX_QUESTION} characters.`);

  const st = await getModuleState(tenantId, db);
  if (input.sandbox) {
    assertVerifiedContext(input.sandbox.ctx);
    if (input.sandbox.ctx.tenantId !== tenantId) throw new AuthorizationError('Wrong school.');
    assertCan(input.sandbox.ctx, 'ai.knowledge.manage');
    if (!st.entitled.has('knowledge_ai')) throw new AssistantUnavailableError('The School Knowledge AI is not included in this school\'s plan.');
  } else if (!st.active.some((m) => m.id === 'knowledge_ai')) {
    throw new AssistantUnavailableError();
  }
  const [t] = await db
    .select({ name: tenants.name, tz: tenants.timezone, display: schoolProfiles.displayName })
    .from(tenants)
    .leftJoin(schoolProfiles, eq(schoolProfiles.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId));
  if (!t) throw new AssistantUnavailableError();
  const channel = input.sandbox ? 'sandbox' : 'portal';
  const userId = viewer.kind === 'public' ? null : viewer.userId;
  const ip = userId ? null : ipHash(tenantId, input.ip);
  const started = Date.now();

  // Phase 1 (short transaction): checks, retrieval, quota.
  const prep = await withTenant(
    tenantId,
    async (tx) => {
      const settings = await settingsRow(tx, tenantId);
      if (!input.sandbox) {
        const on = viewer.kind === 'public' ? settings.publicEnabled : settings.familiesEnabled;
        if (!on) throw new AssistantUnavailableError();
      }
      if (await rateLimited(tx, userId, ip)) throw new ValidationError('Too many questions in a short time. Try again in a few minutes.');
      const statuses: ('approved' | 'pending')[] = input.sandbox?.includePending ? ['approved', 'pending'] : ['approved'];
      const hits = await retrieve(tx, viewer, question, statuses);
      const [cal] = await tx
        .select({ id: knowledgeSources.id, status: knowledgeSources.status })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.kind, 'calendar'));
      const calendarOn = !!cal && statuses.includes(cal.status as 'approved') && st.active.some((m) => m.id === 'calendar');
      return { settings, hits, calendarSourceId: calendarOn ? cal!.id : null };
    },
    db,
  );

  const calendar = prep.calendarSourceId ? await calendarPassage(tenantId, viewer, question, t.tz, db) : null;
  const passages: (Passage & { sourceId: string; url: string | null; topic: string })[] = prep.hits.map((h, i) => ({
    n: i + 1,
    title: h.title,
    heading: h.heading,
    text: h.content,
    authoritative: h.authoritative,
    effectiveDate: h.effectiveDate,
    sourceId: h.sourceId,
    url: h.url,
    topic: h.topic,
  }));
  if (calendar) {
    passages.push({ n: passages.length + 1, title: 'School calendar', heading: 'Upcoming events', text: calendar.text, authoritative: true, effectiveDate: null, sourceId: prep.calendarSourceId!, url: calendar.url, topic: 'calendar' });
  }
  const topic = passages[0]?.topic ?? guessTopic(question);
  const escalationFor = (tp: string) => {
    const list = prep.settings.escalationContacts;
    const c = list.find((x) => x.topic === tp) ?? list.find((x) => x.topic === 'general') ?? null;
    return c ? { name: c.name, email: c.email } : null;
  };

  const log = async (row: Partial<typeof aiQuestions.$inferInsert> & { outcome: typeof aiQuestions.$inferInsert.outcome }, answerText: string | null) => {
    const keep = prep.settings.storeQuestionText;
    const [r] = await withTenant(
      tenantId,
      (tx) =>
        tx
          .insert(aiQuestions)
          .values({
            tenantId,
            channel,
            viewerKind: viewer.kind,
            userId,
            ipHash: ip,
            question: keep ? question : null,
            answer: keep ? answerText : null,
            topic,
            sourceIds: [...new Set(passages.map((p) => p.sourceId))],
            latencyMs: Date.now() - started,
            ...row,
          })
          .returning({ id: aiQuestions.id }),
      db,
    );
    return r?.id ?? null;
  };

  const notFound = 'I couldn\'t find this in the information the school has approved, so I won\'t guess.';
  if (!passages.length) {
    const questionId = await log({ outcome: 'no_answer' }, null);
    return { outcome: 'no_answer', message: notFound, escalation: escalationFor(topic), questionId };
  }

  const provider = getAiProvider();
  if (!provider) {
    const hits = passages.slice(0, 5).map((p) => ({ sourceId: p.sourceId, title: p.title, section: p.heading, url: p.url, excerpt: p.text.slice(0, 400) }));
    const questionId = await log({ outcome: 'search_only' }, null);
    return { outcome: 'search_only', message: 'AI answers are not switched on yet. These approved sources match your question:', hits, questionId };
  }

  try {
    await withTenant(tenantId, (tx) => consume(tx, tenantId, 'aiQuestionsPerMonth'), db);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      await log({ outcome: 'blocked' }, null);
      throw new AssistantUnavailableError('The school assistant has reached this month\'s limit. Please contact the school office.');
    }
    throw err;
  }

  let res;
  try {
    res = await provider.answer({ question, passages, schoolName: t.display ?? t.name, today: toDateStr(new Date(), t.tz), timezone: t.tz });
  } catch (err) {
    console.error('assistant: provider error', (err as Error).message);
    const questionId = await log({ outcome: 'error' }, null);
    return { outcome: 'no_answer', message: 'The assistant could not answer right now. Please try again, or contact the school.', escalation: escalationFor(topic), questionId };
  }
  const usage = { model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costMicroUsd: res.costMicroUsd };
  const verified = res.status === 'answered' && res.answer.trim() ? verifyCitations(res.citations, passages) : [];
  if (!verified.length) {
    const questionId = await log({ outcome: 'no_answer', ...usage }, null);
    return { outcome: 'no_answer', message: notFound, escalation: escalationFor(topic), questionId };
  }
  const citations: Citation[] = [];
  for (const c of verified) {
    const p = passages.find((x) => x.n === c.source)!;
    if (citations.some((x) => x.sourceId === p.sourceId && x.section === p.heading && x.quote === c.quote)) continue;
    citations.push({ sourceId: p.sourceId, title: p.title, section: p.heading, url: p.url, effectiveDate: p.effectiveDate, quote: c.quote });
  }
  const questionId = await log({ outcome: 'answered', citedSourceIds: [...new Set(citations.map((c) => c.sourceId))], ...usage }, res.answer);
  return { outcome: 'answered', answer: res.answer.trim(), citations, questionId };
}

/** "Was this helpful?" from the person who asked. */
export async function recordFeedback(tenantId: string, viewer: Viewer, questionId: string, helpful: boolean, db: Db = platformDb()) {
  assertViewer(viewer, tenantId);
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) return;
  const userId = viewer.kind === 'public' ? null : viewer.userId;
  await withTenant(
    tenantId,
    (tx) =>
      tx
        .update(aiQuestions)
        .set({ feedback: helpful ? 'helpful' : 'not_helpful' })
        .where(
          and(
            eq(aiQuestions.id, questionId),
            userId ? eq(aiQuestions.userId, userId) : sql`${aiQuestions.userId} IS NULL`,
            gt(aiQuestions.createdAt, new Date(Date.now() - 24 * 3600 * 1000)),
          ),
        ),
    db,
  );
}


/** Whether the portal shows the assistant to this viewer (module on and switched on for them). */
export async function assistantAvailableFor(tenantId: string, viewer: Viewer, activeModuleIds: string[], db: Db = platformDb()) {
  assertViewer(viewer, tenantId);
  if (!activeModuleIds.includes('knowledge_ai')) return false;
  const s = await withTenant(tenantId, (tx) => settingsRow(tx, tenantId), db);
  return viewer.kind === 'public' ? s.publicEnabled : s.familiesEnabled;
}
