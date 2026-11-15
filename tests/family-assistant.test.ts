// Family Assistant: private conversations, typed tools that run with the
// family's own identity, and drafts the family must confirm. The model is
// scripted, including one that tries to reach other families' data.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { aiQuestions, assistantActions, assistantConversations, attendanceNotices, directorySettings, inboxItems, memberships } from '@/server/db/schema';
import { loadViewer } from '@/server/viewer';
import { setAssistantModelForTests, type AssistantModel, type RunInput, type ToolExec } from '@/server/ai/assistant-model';
import { setStorageForTests, MemoryStorage } from '@/server/storage/storage';
import { createTextSource, setSourceStatus, purgeOldQuestions, updateAiSettings } from '@/server/services/knowledge';
import { saveStudent, setGuardian } from '@/server/services/students';
import { createFamilyRequest } from '@/server/services/inbox';
import {
  buildAnswer,
  confirmAction,
  deleteConversation,
  dismissAction,
  familyAssistantAvailable,
  getConversation,
  listConversations,
  sendMessage,
  TOOLS,
} from '@/server/services/family-assistant';
import { createSchool, createUser } from './helpers';

const MODS = ['family_accounts', 'operations_inbox', 'attendance_notices', 'knowledge_ai', 'family_assistant'];

type Step = { tool: string; input: unknown } | { final: unknown };
/** Plays a fixed script: calls tools in order, then returns the final JSON. Records every tool result. */
class ScriptedModel implements AssistantModel {
  results: { tool: string; content: string; isError: boolean }[] = [];
  inputs: RunInput[] = [];
  constructor(private script: (results: ScriptedModel['results']) => Step[] | Promise<Step[]>) {}
  async run(input: RunInput, exec: ToolExec) {
    this.inputs.push(input);
    const usage = { model: 'claude-opus-5-5', inputTokens: 900, outputTokens: 120, costMicroUsd: 6000, rounds: 1 };
    for (const step of await this.script(this.results)) {
      if ('final' in step) return { text: JSON.stringify(step.final), ...usage };
      const r = await exec(step.tool, step.input);
      this.results.push({ tool: step.tool, ...r });
    }
    return { text: '', ...usage };
  }
}
const use = (m: AssistantModel | null | undefined) => setAssistantModelForTests(m);

let s: Awaited<ReturnType<typeof createSchool>>;
let key = 0;

async function family(name = 'Parent', school = s) {
  const userId = await createUser(name);
  const m = await withTenant(school.tenant.id, async (tx) => (await tx.insert(memberships).values({ tenantId: school.tenant.id, userId, kind: 'family', status: 'active' }).returning())[0]!);
  return { userId, membershipId: m.id, viewer: await loadViewer(school.tenant.id, userId) };
}
async function childOf(membershipId: string, first = 'Ana') {
  const st = await saveStudent(s.ownerCtx, null, { firstName: first, lastName: `Kid${++key}` });
  await setGuardian(s.ownerCtx, st.id, { membershipId });
  return st;
}
const tomorrow = () => new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);

beforeAll(async () => {
  setStorageForTests(new MemoryStorage());
  s = await createSchool('fa-a', { enabledModules: MODS, status: 'active' });
  await withTenant(s.tenant.id, (tx) => tx.insert(directorySettings).values({ tenantId: s.tenant.id, source: 'manual' }));
  await updateAiSettings(s.ownerCtx, { familiesEnabled: false, publicEnabled: false, retentionDays: 30, storeQuestionText: true, escalationContacts: [] });
});
afterEach(() => use(undefined));
afterAll(async () => {
  await closeDb();
});

describe('who can use it', () => {
  it('only signed-in families, only with the module on and a model configured', async () => {
    const p = await family();
    expect(await familyAssistantAvailable(s.tenant.id, p.viewer)).toBe(true);
    const off = await createSchool('fa-off', { enabledModules: ['family_accounts'], status: 'active' });
    const q = await family('Off parent', off);
    expect(await familyAssistantAvailable(off.tenant.id, q.viewer)).toBe(false);
    use(new ScriptedModel(() => [{ final: { answer: 'hi', citations: [] } }]));
    await expect(sendMessage(off.tenant.id, q.viewer, null, 'Hello')).rejects.toThrow(/not available/);
    const staffViewer = await loadViewer(s.tenant.id, s.ownerId);
    await expect(sendMessage(s.tenant.id, staffViewer, null, 'Hello')).rejects.toThrow(/family account/);
    use(null);
    await expect(sendMessage(s.tenant.id, p.viewer, null, 'Hello')).rejects.toThrow(/not switched on/);
  });
});

describe('tools run as the family', () => {
  it('lists only this family\'s children and requests, never another family\'s', async () => {
    const p = await family();
    const other = await family('Other');
    const mine = await childOf(p.membershipId, 'Mia');
    await childOf(other.membershipId, 'Zoe');
    const theirs = await createFamilyRequest(s.tenant.id, other.viewer, { kind: 'request', subject: 'Other family request', body: 'secret' });
    const own = await createFamilyRequest(s.tenant.id, p.viewer, { kind: 'request', subject: 'Lost jacket', body: 'Blue jacket' });
    const m = new ScriptedModel(() => [
      { tool: 'list_my_children', input: {} },
      { tool: 'list_my_requests', input: { include: 'all' } },
      { tool: 'get_request', input: { number: theirs.number } },
      { final: { answer: `Your request R-${own.number} is received.`, citations: [] } },
    ]);
    use(m);
    const r = await sendMessage(s.tenant.id, p.viewer, null, 'What is going on with my requests?');
    expect(m.results[0]!.content).toContain(`manual:${mine.id}`);
    expect(m.results[0]!.content).not.toContain('Zoe');
    expect(m.results[1]!.content).toContain('Lost jacket');
    expect(m.results[1]!.content).not.toContain('Other family request');
    expect(m.results[2]).toMatchObject({ isError: true });
    expect(m.results[2]!.content).not.toContain('secret');
    const conv = await getConversation(s.tenant.id, p.viewer, r.conversationId);
    const answer = conv.messages.at(-1)!;
    expect(answer.cards).toEqual([{ kind: 'request', id: own.id, number: own.number, subject: 'Lost jacket', status: 'Received' }]);
  });

  it('rejects unknown tools, bad input and tools for modules that are off', async () => {
    const p = await family();
    const m = new ScriptedModel(() => [
      { tool: 'delete_everything', input: {} },
      { tool: 'get_request', input: { number: 'R-1; drop table' } },
      { tool: 'list_my_children', input: { tenantId: 'another-school' } },
      { tool: 'upcoming_events', input: { days: 7 } },
      { final: { answer: 'Done.', citations: [] } },
    ]);
    use(m);
    await sendMessage(s.tenant.id, p.viewer, null, 'Try things');
    expect(m.results.map((x) => x.isError)).toEqual([true, true, true, true]);
    expect(m.results[3]!.content).toMatch(/Unknown tool/); // calendar module is off in this school
    expect(m.inputs[0]!.tools.map((t) => t.name)).not.toContain('upcoming_events');
  });

  it('prepares an absence notice as a draft; nothing is sent until the family confirms, once', async () => {
    const p = await family();
    const kid = await childOf(p.membershipId);
    const m = new ScriptedModel(() => [
      { tool: 'prepare_absence_notice', input: { child: `manual:${kid.id}`, type: 'absent', dateFrom: tomorrow(), reason: 'illness' } },
      { final: { answer: 'I prepared the notice. Please review it and press Send.', citations: [] } },
    ]);
    use(m);
    const r = await sendMessage(s.tenant.id, p.viewer, null, 'Ana is sick tomorrow');
    expect(m.results[0]).toMatchObject({ isError: false });
    expect(await withTenant(s.tenant.id, (tx) => tx.select().from(attendanceNotices).where(eq(attendanceNotices.userId, p.userId)))).toEqual([]);
    const conv = await getConversation(s.tenant.id, p.viewer, r.conversationId);
    const card = conv.messages.at(-1)!.cards.find((c) => c.kind === 'action');
    expect(card).toBeTruthy();
    const actionId = (card as { actionId: string }).actionId;
    expect(conv.actions[actionId]).toMatchObject({ status: 'proposed', summary: expect.stringMatching(/Absent: Ana Kid\d+/) });
    // Another family can't send it.
    const other = await family('Other');
    await expect(confirmAction(s.tenant.id, other.viewer, actionId)).rejects.toThrow(/already sent|not found|day old/);
    const sent = await confirmAction(s.tenant.id, p.viewer, actionId);
    expect(sent.ref).toMatch(/^R-\d+$/);
    await expect(confirmAction(s.tenant.id, p.viewer, actionId)).rejects.toThrow(/already sent/);
    expect(await withTenant(s.tenant.id, (tx) => tx.select().from(attendanceNotices).where(eq(attendanceNotices.userId, p.userId)))).toHaveLength(1);
  });

  it('won\'t prepare anything for a child who isn\'t theirs, and re-checks on Send', async () => {
    const p = await family();
    const other = await family('Other');
    const notMine = await childOf(other.membershipId);
    const mine = await childOf(p.membershipId);
    const m = new ScriptedModel(() => [
      { tool: 'prepare_absence_notice', input: { child: `manual:${notMine.id}`, type: 'absent', dateFrom: tomorrow(), reason: 'illness' } },
      { tool: 'prepare_absence_notice', input: { child: `manual:${mine.id}`, type: 'late', dateFrom: tomorrow(), reason: 'other' } },
      { tool: 'prepare_office_request', input: { kind: 'request', subject: 'Pick up', body: 'Grandma picks up', child: `manual:${notMine.id}` } },
      { tool: 'prepare_absence_notice', input: { child: `manual:${mine.id}`, type: 'absent', dateFrom: tomorrow(), reason: 'illness' } },
      { final: { answer: 'Review the draft below.', citations: [] } },
    ]);
    use(m);
    const r = await sendMessage(s.tenant.id, p.viewer, null, 'Absences');
    expect(m.results.map((x) => x.isError)).toEqual([true, true, true, false]);
    expect(m.results[1]!.content).toMatch(/time/); // late needs a time
    const conv = await getConversation(s.tenant.id, p.viewer, r.conversationId);
    expect(Object.keys(conv.actions)).toHaveLength(1);
    // The link is removed before the family presses Send.
    await setGuardian(s.ownerCtx, mine.id, { membershipId: p.membershipId, access: 'restricted', restrictionNote: 'Court order on file' });
    const id = Object.keys(conv.actions)[0]!;
    await expect(confirmAction(s.tenant.id, p.viewer, id)).rejects.toThrow(/can't send attendance notices/);
    expect((await getConversation(s.tenant.id, p.viewer, r.conversationId)).actions[id]).toMatchObject({ status: 'failed' });
  });

  it('a discarded draft can\'t be sent', async () => {
    const p = await family();
    use(new ScriptedModel(() => [{ tool: 'prepare_office_request', input: { kind: 'question', subject: 'Uniform', body: 'Can we wear sneakers?' } }, { final: { answer: 'Draft ready.', citations: [] } }]));
    const r = await sendMessage(s.tenant.id, p.viewer, null, 'Ask about sneakers');
    const id = Object.keys((await getConversation(s.tenant.id, p.viewer, r.conversationId)).actions)[0]!;
    await dismissAction(s.tenant.id, p.viewer, id);
    await expect(confirmAction(s.tenant.id, p.viewer, id)).rejects.toThrow(/already sent, discarded/);
    expect(await withTenant(s.tenant.id, (tx) => tx.select().from(inboxItems).where(eq(inboxItems.requesterUserId, p.userId)))).toEqual([]);
  });
});

describe('answers about the school', () => {
  it('shows only citations that really appear in the approved passages', async () => {
    const src = await createTextSource(s.ownerCtx, { kind: 'faq', title: 'Drop-off', body: 'Drop-off starts at 7:30 AM at the north door.', visibility: 'families' });
    await setSourceStatus(s.ownerCtx, [src.id], 'approved');
    const p = await family();
    use(new ScriptedModel(() => [{ tool: 'search_school_info', input: { query: 'drop-off time' } }, { final: { answer: 'Drop-off starts at 7:30 AM.', citations: [{ source: 'S1', quote: 'Drop-off starts at 7:30 AM' }] } }]));
    const ok = await sendMessage(s.tenant.id, p.viewer, null, 'When is drop-off?');
    const okMsg = (await getConversation(s.tenant.id, p.viewer, ok.conversationId)).messages.at(-1)!;
    expect(okMsg.content).toBe('Drop-off starts at 7:30 AM.');
    expect(okMsg.cards).toEqual([{ kind: 'source', title: 'Drop-off', section: 'Drop-off', url: null, quote: 'Drop-off starts at 7:30 AM' }]);
    // A made-up quote is not shown as an answer.
    use(new ScriptedModel(() => [{ tool: 'search_school_info', input: { query: 'drop-off time' } }, { final: { answer: 'Drop-off starts at 6 AM.', citations: [{ source: 'S1', quote: 'Drop-off starts at 6:00 AM sharp' }] } }]));
    const bad = await sendMessage(s.tenant.id, p.viewer, ok.conversationId, 'Are you sure?');
    const badMsg = (await getConversation(s.tenant.id, p.viewer, bad.conversationId)).messages.at(-1)!;
    expect(badMsg.content).toMatch(/won't guess/);
    expect(badMsg.cards).toEqual([]);
  });

  it('buildAnswer ignores malformed output and request numbers it did not look up', () => {
    expect(buildAnswer('not json', { passages: [], requests: new Map() })).toEqual({ answer: '', cards: [] });
    expect(buildAnswer(JSON.stringify({ answer: 'See R-9999.', citations: [] }), { passages: [], requests: new Map() })).toEqual({ answer: 'See R-9999.', cards: [] });
  });
});

describe('privacy, limits and retention', () => {
  it('conversations are private to the family and logged for the school without text', async () => {
    const p = await family();
    const other = await family('Other');
    use(new ScriptedModel(() => [{ final: { answer: 'Hello!', citations: [] } }]));
    const r = await sendMessage(s.tenant.id, p.viewer, null, 'My private question about my son');
    expect((await listConversations(s.tenant.id, p.viewer)).map((c) => c.id)).toContain(r.conversationId);
    expect((await listConversations(s.tenant.id, other.viewer)).map((c) => c.id)).not.toContain(r.conversationId);
    await expect(getConversation(s.tenant.id, other.viewer, r.conversationId)).rejects.toThrow(/not found/);
    await expect(sendMessage(s.tenant.id, other.viewer, r.conversationId, 'Hijack')).rejects.toThrow(/not found/);
    await expect(deleteConversation(s.tenant.id, other.viewer, r.conversationId)).rejects.toThrow(/not found/);
    const logs = await withTenant(s.tenant.id, (tx) => tx.select().from(aiQuestions).where(eq(aiQuestions.userId, p.userId)));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ channel: 'family_assistant', question: null, answer: null, outcome: 'answered', costMicroUsd: 6000 });
    await deleteConversation(s.tenant.id, p.viewer, r.conversationId);
    expect(await listConversations(s.tenant.id, p.viewer)).toEqual([]);
  });

  it('a model error gives a polite message; the quota stops it on plans without AI', async () => {
    const p = await family();
    use({ run: async () => { throw new Error('upstream down'); } });
    const r = await sendMessage(s.tenant.id, p.viewer, null, 'Hello');
    expect((await getConversation(s.tenant.id, p.viewer, r.conversationId)).messages.at(-1)!.content).toMatch(/could not answer right now/);
    const ess = await createSchool('fa-ess', { enabledModules: MODS, status: 'active' });
    await withTenant(ess.tenant.id, (tx) => tx.execute(`select 1`));
    const { subscriptions } = await import('@/server/db/schema');
    const { platformDb } = await import('@/server/db/client');
    await platformDb().update(subscriptions).set({ limitOverrides: { aiQuestionsPerMonth: 0 } }).where(eq(subscriptions.tenantId, ess.tenant.id));
    const q = await family('Ess parent', ess);
    use(new ScriptedModel(() => [{ final: { answer: 'Hi', citations: [] } }]));
    await expect(sendMessage(ess.tenant.id, q.viewer, null, 'Hello')).rejects.toThrow(/this month's limit/);
  });

  it('old conversations are deleted with the school\'s retention period', async () => {
    const p = await family();
    use(new ScriptedModel(() => [{ final: { answer: 'Hi', citations: [] } }]));
    const r = await sendMessage(s.tenant.id, p.viewer, null, 'Hello');
    await withTenant(s.tenant.id, (tx) => tx.update(assistantConversations).set({ updatedAt: new Date(Date.now() - 40 * 24 * 3600_000) }).where(eq(assistantConversations.id, r.conversationId)));
    await withTenant(s.tenant.id, (tx) => purgeOldQuestions(tx, s.tenant.id));
    expect(await withTenant(s.tenant.id, (tx) => tx.select().from(assistantConversations).where(eq(assistantConversations.id, r.conversationId)))).toEqual([]);
    expect(await withTenant(s.tenant.id, (tx) => tx.select().from(assistantActions).where(eq(assistantActions.conversationId, r.conversationId)))).toEqual([]);
  });

  it('every tool has a strict object schema', () => {
    for (const t of TOOLS) {
      expect(t.spec.input_schema.type).toBe('object');
      expect(t.spec.input_schema.additionalProperties).toBe(false);
    }
  });
});
