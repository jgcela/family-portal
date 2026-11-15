// Operations analytics: counts, medians and the time-saved estimate come out
// right, use only aggregates, respect permissions and the module switch.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { aiQuestions, attendanceNotices, inboxItems, memberships, membershipRoles, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { getAssumptions, getOpsAnalytics, updateAssumptions } from '@/server/services/analytics';
import { createSchool, createUser } from './helpers';

const NOW = new Date('2026-11-16T18:00:00Z');
const H = 3600_000;
const ago = (h: number) => new Date(NOW.getTime() - h * H);
let s: Awaited<ReturnType<typeof createSchool>>;
let n = 1000;

async function staff(tenantId: string, roleKey: string) {
  const userId = await createUser(`analytics-${roleKey}`);
  await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
    await tx.insert(membershipRoles).values({ tenantId, membershipId: m!.id, roleId: r!.id, scopeType: 'school', scopeId: null });
  });
  return (await loadAuthzContext(tenantId, userId))!;
}

type Item = { kind: 'attendance' | 'question' | 'request'; at: Date; reply?: number; resolve?: number; automated?: boolean; status?: 'new' | 'resolved' | 'in_progress'; due?: Date };
async function item(i: Item) {
  await withTenant(s.tenant.id, (tx) =>
    tx.insert(inboxItems).values({
      tenantId: s.tenant.id,
      number: ++n,
      kind: i.kind,
      subject: 'Private subject Lucia',
      body: 'Private body',
      status: i.status ?? (i.resolve !== undefined ? 'resolved' : 'new'),
      automated: !!i.automated,
      createdAt: i.at,
      firstResponseAt: i.reply !== undefined ? new Date(i.at.getTime() + i.reply * H) : null,
      resolvedAt: i.resolve !== undefined ? new Date(i.at.getTime() + i.resolve * H) : null,
      dueAt: i.due ?? null,
    }),
  );
}

beforeAll(async () => {
  s = await createSchool('an-a', { enabledModules: ['family_accounts', 'operations_inbox', 'attendance_notices', 'knowledge_ai', 'ops_analytics'], status: 'active' });
  const parent = await createUser('Analytics parent');
  const [m] = await withTenant(s.tenant.id, (tx) => tx.insert(memberships).values({ tenantId: s.tenant.id, userId: parent, kind: 'family', status: 'active' }).returning());
  // In the last 30 days: 3 attendance (2 automated), 2 questions, 1 request; one older item outside.
  await item({ kind: 'attendance', at: ago(24), automated: true, resolve: 0 });
  await item({ kind: 'attendance', at: ago(48), automated: true, resolve: 0 });
  await item({ kind: 'attendance', at: ago(72), reply: 1, resolve: 2 });
  await item({ kind: 'question', at: ago(100), reply: 3, resolve: 10 });
  await item({ kind: 'question', at: ago(200), reply: 30, status: 'in_progress', due: ago(1) });
  await item({ kind: 'request', at: ago(300), status: 'new' });
  await item({ kind: 'request', at: ago(24 * 60), reply: 100, resolve: 200 });
  const notice = (type: 'absent' | 'late', status: 'received' | 'cancelled', at: Date, key: string) => ({
    tenantId: s.tenant.id,
    studentKey: 'facts:9001',
    studentName: 'Lucia Private',
    membershipId: m!.id,
    userId: parent,
    type,
    dateFrom: '2026-11-17',
    dateTo: '2026-11-17',
    reason: 'illness' as const,
    status,
    idempotencyKey: key,
    createdAt: at,
  });
  await withTenant(s.tenant.id, (tx) =>
    tx.insert(attendanceNotices).values([notice('absent', 'received', ago(24), 'an-1-abcdefgh'), notice('late', 'received', ago(48), 'an-2-abcdefgh'), notice('absent', 'received', ago(72), 'an-3-abcdefgh'), notice('absent', 'cancelled', ago(80), 'an-4-abcdefgh')]),
  );
  const q = (channel: 'portal' | 'family_assistant' | 'sandbox', outcome: 'answered' | 'no_answer', extra: Record<string, unknown> = {}) => ({
    tenantId: s.tenant.id,
    channel,
    viewerKind: 'family',
    outcome,
    question: 'secret question text',
    costMicroUsd: 10_000,
    createdAt: ago(10),
    ...extra,
  });
  await withTenant(s.tenant.id, (tx) =>
    tx.insert(aiQuestions).values([
      q('portal', 'answered', { feedback: 'helpful' }),
      q('portal', 'answered', { escalated: true }),
      q('family_assistant', 'answered'),
      q('portal', 'no_answer'),
      q('sandbox', 'answered'),
    ]),
  );
});
afterAll(async () => {
  await closeDb();
});

describe('operations analytics', () => {
  it('counts what happened in the period and nothing older', async () => {
    const r = await getOpsAnalytics(s.ownerCtx, 30, NOW);
    expect(r.volume).toMatchObject({ items: 6, attendance: 3, questions: 2, requests: 1 });
    expect(r.notices).toMatchObject({ total: 3, absent: 2, late: 1, cancelled: 1 });
    expect(r.automation).toMatchObject({ automated: 2, automatedPct: 33.3 });
    expect(r.speed).toMatchObject({ openNow: 2, overdueNow: 1 });
    expect(r.volume.weekly.reduce((t, w) => t + w.attendance + w.other, 0)).toBe(6);
    const all = await getOpsAnalytics(s.ownerCtx, 90, NOW);
    expect(all.volume.items).toBe(7);
  });

  it('medians leave out automated items; 24 h rate counts human replies', async () => {
    const r = await getOpsAnalytics(s.ownerCtx, 30, NOW);
    // Human replies: 1 h, 3 h, 30 h → median 3 h. Resolutions: 2 h, 10 h → median 6 h.
    expect(r.speed.medianFirstResponseHours).toBeCloseTo(3);
    expect(r.speed.medianResolveHours).toBeCloseTo(6);
    // 4 human items not cancelled; 2 replied within 24 h.
    expect(r.speed.respondedWithin24hPct).toBe(50);
  });

  it('AI: sandbox tests are left out; an escalated answer is not counted as saved work', async () => {
    const r = await getOpsAnalytics(s.ownerCtx, 30, NOW);
    expect(r.ai).toMatchObject({ questions: 4, portal: 3, assistant: 1, answered: 2, answeredPct: 50, noAnswer: 1, escalated: 1, helpful: 1, costUsd: 0.04, costPerAnswerUsd: 0.02 });
  });

  it('time saved uses the school\'s minutes; money only when an hourly cost is set', async () => {
    const r = await getOpsAnalytics(s.ownerCtx, 30, NOW);
    // 3 notices × 3 + 2 answers × 4 + 2 automated × 2 = 21 minutes.
    expect(r.estimate).toMatchObject({ minutes: { absences: 9, questions: 8, automation: 4 }, hours: 0.4, staffCostSavedUsd: null });
    await updateAssumptions(s.ownerCtx, { minutesPerAbsenceCall: 10, minutesPerAnsweredQuestion: 5, minutesPerAutomatedItem: 5, hourlyStaffCost: 30 });
    const r2 = await getOpsAnalytics(s.ownerCtx, 30, NOW);
    // 30 + 10 + 10 = 50 minutes → 0.8 h, $25.
    expect(r2.estimate).toMatchObject({ hours: 0.8, staffCostSavedUsd: 25 });
    await expect(updateAssumptions(s.ownerCtx, { minutesPerAbsenceCall: 500 })).rejects.toThrow();
    await expect(updateAssumptions(s.ownerCtx, { minutesPerAbsenceCall: 3, script: 'x' })).rejects.toThrow();
    expect((await getAssumptions(s.tenant.id)).minutesPerAbsenceCall).toBe(10);
  });

  it('returns aggregates only: no names, subjects or question text', async () => {
    const text = JSON.stringify(await getOpsAnalytics(s.ownerCtx, 365, NOW));
    for (const secret of ['Lucia', 'Private', 'secret question', 'facts:9001']) expect(text).not.toContain(secret);
  });

  it('needs analytics.view and the module; only module managers change the assumptions', async () => {
    const office = await staff(s.tenant.id, 'attendance_staff');
    await expect(getOpsAnalytics(office, 30, NOW)).rejects.toThrow(/analytics.view/);
    const reviewer = await staff(s.tenant.id, 'reviewer');
    expect((await getOpsAnalytics(reviewer, 30, NOW)).volume.items).toBe(6);
    await expect(updateAssumptions(reviewer, { minutesPerAbsenceCall: 1 })).rejects.toThrow();
    const off = await createSchool('an-off', { enabledModules: ['operations_inbox'], status: 'active' });
    await expect(getOpsAnalytics(off.ownerCtx, 30, NOW)).rejects.toThrow(/not switched on/);
  });
});
