// Phase 3: students and guardians, attendance notices, the operations inbox
// and workflow rules. Covers authorization (per child, per grade, per
// school), the notice state machine, idempotency and family privacy.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { directorySettings, familyGrades, grades, inboxItems, memberships, membershipRoles, roles, subscriptions, user, usageCounters, workflows } from '@/server/db/schema';
import { loadViewer } from '@/server/viewer';
import { loadAuthzContext } from '@/server/rbac/context';
import { importStudents, myChildren, parseCsv, removeGuardian, saveStudent, setGuardian, getStudent, listStudents } from '@/server/services/students';
import { cancelNotice, markRecordedInSis, reviewNotice, submitNotice, validateDates } from '@/server/services/attendance';
import {
  addComment,
  bulkUpdate,
  createFamilyRequest,
  getInboxItem,
  inboxStats,
  listInbox,
  myRequest,
  myRequests,
  parseFilters,
  runEscalations,
  updateInboxItem,
} from '@/server/services/inbox';
import { createFromTemplate, updateWorkflow, workflowConfigSchema } from '@/server/services/workflows';
import { createSchool, createUser } from './helpers';

const OPS = ['family_accounts', 'operations_inbox', 'attendance_notices', 'workflows'];
let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;
const NOW = new Date('2026-11-16T15:00:00Z'); // Monday morning in Denver
let key = 0;
const k = () => `key-${++key}-abcdefgh`;

async function gradeIdOf(tenantId: string, code: string) {
  return withTenant(tenantId, async (tx) => (await tx.select().from(grades).where(eq(grades.code, code)))[0]!.id);
}

async function family(s = a, name = 'Parent') {
  const userId = await createUser(name);
  const m = await withTenant(s.tenant.id, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId: s.tenant.id, userId, kind: 'family', status: 'active' }).returning();
    await tx.insert(familyGrades).values({ tenantId: s.tenant.id, membershipId: m!.id, gradeId: await gradeIdOf(s.tenant.id, '3') });
    return m!;
  });
  return { userId, membershipId: m.id, viewer: await loadViewer(s.tenant.id, userId) };
}

async function staff(roleKey: string, scope: { gradeCode?: string } = {}, s = a) {
  const userId = await createUser(`Staff ${roleKey}`);
  const gradeId = scope.gradeCode ? await gradeIdOf(s.tenant.id, scope.gradeCode) : null;
  await withTenant(s.tenant.id, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId: s.tenant.id, userId, kind: 'staff', status: 'active' }).returning();
    const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
    await tx.insert(membershipRoles).values({ tenantId: s.tenant.id, membershipId: m!.id, roleId: r!.id, scopeType: gradeId ? 'grade' : 'school', scopeId: gradeId });
  });
  return { userId, ctx: (await loadAuthzContext(s.tenant.id, userId))! };
}

async function child(gradeCode: string, guardianMembershipId?: string, s = a, link: Record<string, unknown> = {}) {
  const st = await saveStudent(s.ownerCtx, null, { firstName: 'Ana', lastName: `Student${gradeCode}${++key}`, gradeId: await gradeIdOf(s.tenant.id, gradeCode) });
  if (guardianMembershipId) await setGuardian(s.ownerCtx, st.id, { membershipId: guardianMembershipId, ...link });
  return st;
}

const absent = (studentId: string, extra: Record<string, unknown> = {}) => ({ studentId, type: 'absent', dateFrom: '2026-11-17', dateTo: '', reason: 'illness', comment: '', idempotencyKey: k(), ...extra });

/** A school using its own student list (these tests don't involve FACTS). */
async function opsSchool(slug: string) {
  const s = await createSchool(slug, { enabledModules: OPS, status: 'active' });
  await withTenant(s.tenant.id, (tx) => tx.insert(directorySettings).values({ tenantId: s.tenant.id, source: 'manual' }));
  return s;
}

beforeAll(async () => {
  a = await opsSchool('ops-a');
  b = await opsSchool('ops-b');
});
afterAll(async () => {
  await closeDb();
});

describe('students and guardians', () => {
  it('families act only for children linked to them, with the right permission', async () => {
    const p = await family();
    const other = await family(a, 'Other parent');
    const mine = await child('3', p.membershipId);
    const notMine = await child('3', other.membershipId);
    const noAttendance = await child('3', p.membershipId, a, { canSubmitAttendance: false });
    await expect(submitNotice(a.tenant.id, p.viewer, absent(notMine.id), NOW)).rejects.toThrow(/can't send attendance notices/);
    await expect(submitNotice(a.tenant.id, p.viewer, absent(noAttendance.id), NOW)).rejects.toThrow(/can't send attendance notices/);
    await expect(submitNotice(a.tenant.id, p.viewer, absent(mine.id), NOW)).resolves.toMatchObject({ duplicate: false });
    const kids = await myChildren(a.tenant.id, p.viewer);
    expect(kids.map((c) => c.id).sort()).toEqual([mine.id, noAttendance.id].sort());
  });

  it('a restricted link removes all access and needs a staff-only note', async () => {
    const p = await family();
    const s = await child('3', p.membershipId);
    await expect(setGuardian(a.ownerCtx, s.id, { membershipId: p.membershipId, access: 'restricted' })).rejects.toThrow(/note/);
    await setGuardian(a.ownerCtx, s.id, { membershipId: p.membershipId, access: 'restricted', restrictionNote: 'Court order on file, 2026-10-01' });
    await expect(submitNotice(a.tenant.id, p.viewer, absent(s.id), NOW)).rejects.toThrow(/can't send/);
    expect(await myChildren(a.tenant.id, p.viewer)).toEqual([]);
    // Teachers see the student but not the custody note.
    const t = await staff('teacher', { gradeCode: '3' });
    const seen = await getStudent(t.ctx, s.id);
    expect(seen.guardians[0]!.access).toBe('restricted');
    expect(seen.guardians[0]!.restrictionNote).toBeNull();
    expect((await getStudent(a.ownerCtx, s.id)).guardians[0]!.restrictionNote).toMatch(/Court order/);
  });

  it('grade-scoped staff only see students in their grades', async () => {
    const t = await staff('teacher', { gradeCode: '5' });
    const s3 = await child('3');
    const s5 = await child('5');
    const ids = (await listStudents(t.ctx)).map((s) => s.id);
    expect(ids).toContain(s5.id);
    expect(ids).not.toContain(s3.id);
    await expect(getStudent(t.ctx, s3.id)).rejects.toThrow(/students.view/);
    await expect(saveStudent(t.ctx, null, { firstName: 'X', lastName: 'Y' })).rejects.toThrow(/students.manage/);
  });

  it('imports a CSV, links guardians by email and reports what it could not do', async () => {
    const p = await family(a, 'Importer parent');
    const [u] = await platformDb().select().from(user).where(eq(user.id, p.userId));
    const csv = `first_name,last_name,grade,sis_id,guardian_emails\n"María José","O'Neil, Jr",3,S-900,${u!.email}; nobody@example.test\nLuis,Pérez,99,,\n,Missing,3,,`;
    const r = await importStudents(a.ownerCtx, csv);
    expect(r).toMatchObject({ created: 2, updated: 0, linked: 1 });
    expect(r.problems.join(' ')).toMatch(/nobody@example.test/);
    expect(r.problems.join(' ')).toMatch(/grade "99"/);
    expect(r.problems.join(' ')).toMatch(/missing name/);
    // Same sis_id again updates instead of duplicating.
    expect(await importStudents(a.ownerCtx, 'first_name,last_name,grade,sis_id\nMaría José,O\'Neil,4,S-900')).toMatchObject({ created: 0, updated: 1 });
    expect(parseCsv('a,"b ""c""",d\r\n1,2,3')).toEqual([['a', 'b "c"', 'd'], ['1', '2', '3']]);
  });

  it('removing a guardian link ends access at once', async () => {
    const p = await family();
    const s = await child('3', p.membershipId);
    await removeGuardian(a.ownerCtx, s.id, p.membershipId);
    await expect(submitNotice(a.tenant.id, p.viewer, absent(s.id), NOW)).rejects.toThrow(/can't send/);
  });
});

describe('attendance notices', () => {
  it('a submitted notice is received, gets a reference and an inbox item; a repeat is not duplicated', async () => {
    const p = await family();
    const s = await child('3', p.membershipId);
    const input = absent(s.id, { comment: 'Fever since last night' });
    const first = await submitNotice(a.tenant.id, p.viewer, input, NOW);
    expect(first.notice.status).toBe('received');
    const again = await submitNotice(a.tenant.id, p.viewer, input, NOW);
    expect(again).toMatchObject({ duplicate: true, notice: { id: first.notice.id } });
    const mine = await myRequests(a.tenant.id, p.viewer);
    expect(mine.filter((r) => r.kind === 'attendance')).toHaveLength(1);
    expect(mine[0]!.number).toBeGreaterThan(1000);
  });

  it('validates dates and times in the school time zone', async () => {
    const today = '2026-11-16';
    expect(() => validateDates({ type: 'late', dateFrom: today, dateTo: today, time: null }, today)).toThrow(/arrival time/);
    expect(() => validateDates({ type: 'absent', dateFrom: '2026-10-01', dateTo: '2026-10-01', time: null }, today)).toThrow(/14 days after/);
    expect(() => validateDates({ type: 'absent', dateFrom: today, dateTo: '2026-12-05', time: null }, today)).toThrow(/longer than 14/);
    expect(() => validateDates({ type: 'absent', dateFrom: '2026-11-20', dateTo: '2026-11-19', time: null }, today)).toThrow(/on or after/);
    const p = await family();
    const s = await child('3', p.membershipId);
    await submitNotice(a.tenant.id, p.viewer, absent(s.id, { dateFrom: '2026-11-18', dateTo: '2026-11-19' }), NOW);
    await expect(submitNotice(a.tenant.id, p.viewer, absent(s.id, { dateFrom: '2026-11-19' }), NOW)).rejects.toThrow(/already a notice/);
    await expect(submitNotice(a.tenant.id, p.viewer, absent(s.id, { type: 'late', time: '09:40', dateFrom: '2026-11-19' }), NOW)).resolves.toBeTruthy();
  });

  it('only reviewers for that grade can decide; the state machine refuses illegal moves', async () => {
    const p = await family();
    const s3 = await child('3', p.membershipId);
    const { notice } = await submitNotice(a.tenant.id, p.viewer, absent(s3.id, { dateFrom: '2026-11-20' }), NOW);
    const office5 = await staff('attendance_staff', { gradeCode: '5' });
    const office3 = await staff('attendance_staff', { gradeCode: '3' });
    await expect(reviewNotice(office5.ctx, notice.id, 'approve', null, NOW)).rejects.toThrow(/attendance.review/);
    await expect(reviewNotice(office3.ctx, notice.id, 'reject', '', NOW)).rejects.toThrow(/why/);
    await reviewNotice(office3.ctx, notice.id, 'start', null, NOW);
    await reviewNotice(office3.ctx, notice.id, 'approve', null, NOW);
    await expect(reviewNotice(office3.ctx, notice.id, 'reject', 'Too late', NOW)).rejects.toThrow(/can't become/);
    await markRecordedInSis(office3.ctx, notice.id, NOW);
    await expect(markRecordedInSis(office3.ctx, notice.id, NOW)).rejects.toThrow(/Already/);
    const mine = await myRequests(a.tenant.id, p.viewer);
    const row = mine.find((r) => r.noticeStatus === 'approved')!;
    expect(row.status).toBe('resolved');
    // The family sees the decision, not internal notes.
    const detail = await myRequest(a.tenant.id, p.viewer, row.id);
    expect(detail.events.map((e) => e.body).join(' ')).toMatch(/Accepted/);
    expect(detail.events.map((e) => e.body).join(' ')).not.toMatch(/SIS by hand/);
  });

  it('families cancel future notices but not past ones', async () => {
    const p = await family();
    const s = await child('3', p.membershipId);
    const { notice } = await submitNotice(a.tenant.id, p.viewer, absent(s.id, { dateFrom: '2026-11-24' }), NOW);
    await cancelNotice(a.tenant.id, p.viewer, notice.id, NOW);
    await expect(cancelNotice(a.tenant.id, p.viewer, notice.id, NOW)).rejects.toThrow(/can't become/);
    const past = await submitNotice(a.tenant.id, p.viewer, absent(s.id, { dateFrom: '2026-11-10' }), NOW);
    await expect(cancelNotice(a.tenant.id, p.viewer, past.notice.id, NOW)).rejects.toThrow(/in the past/);
    const other = await family();
    await expect(cancelNotice(a.tenant.id, other.viewer, past.notice.id, NOW)).rejects.toThrow(/not found/);
  });

  it('is refused when the module is off, and a viewer from another school is rejected', async () => {
    const off = await createSchool('ops-off', { enabledModules: ['family_accounts'], status: 'active' });
    await withTenant(off.tenant.id, (tx) => tx.insert(directorySettings).values({ tenantId: off.tenant.id, source: 'manual' }));
    const p = await family(off);
    const s = await child('3', p.membershipId, off);
    await expect(submitNotice(off.tenant.id, p.viewer, absent(s.id), NOW)).rejects.toThrow(/not taking attendance/);
    const pa = await family(a);
    await expect(submitNotice(b.tenant.id, pa.viewer, absent(s.id), NOW)).rejects.toThrow(/another school/);
  });
});

describe('operations inbox', () => {
  it('scopes the inbox by grade and hides internal notes from families', async () => {
    const p = await family();
    const s5 = await child('5', p.membershipId);
    const item = await createFamilyRequest(a.tenant.id, p.viewer, { kind: 'request', subject: 'Locker broken', body: 'The locker does not close.', studentId: s5.id }, NOW);
    const t3 = await staff('teacher', { gradeCode: '3' });
    const office = await staff('attendance_staff');
    expect((await listInbox(t3.ctx, parseFilters({}), NOW)).some((i) => i.id === item.id)).toBe(false);
    await expect(getInboxItem(t3.ctx, item.id)).rejects.toThrow(/inbox.view/);
    expect((await listInbox(office.ctx, parseFilters({ q: `R-${item.number}` }), NOW)).map((i) => i.id)).toEqual([item.id]);
    await addComment(office.ctx, item.id, { body: 'Maintenance ticket 55', toFamily: false }, NOW);
    await addComment(office.ctx, item.id, { body: 'We will fix it this week.', toFamily: true, waitForFamily: true }, NOW);
    const fam = await myRequest(a.tenant.id, p.viewer, item.id);
    expect(fam.item.status).toBe('waiting');
    const bodies = fam.events.map((e) => e.body).join(' | ');
    expect(bodies).toMatch(/fix it this week/);
    expect(bodies).not.toMatch(/Maintenance ticket/);
    const other = await family();
    await expect(myRequest(a.tenant.id, other.viewer, item.id)).rejects.toThrow(/not found/);
    const st = await inboxStats(office.ctx, NOW);
    expect(st.open).toBeGreaterThan(0);
  });

  it('bulk updates skip what the user may not change and never close attendance items', async () => {
    const p = await family();
    const s3 = await child('3', p.membershipId);
    const s5 = await child('5', p.membershipId);
    const r3 = await createFamilyRequest(a.tenant.id, p.viewer, { kind: 'question', subject: 'Book list', body: '?', studentId: s3.id }, NOW);
    const r5 = await createFamilyRequest(a.tenant.id, p.viewer, { kind: 'question', subject: 'Book list', body: '?', studentId: s5.id }, NOW);
    const { notice } = await submitNotice(a.tenant.id, p.viewer, absent(s3.id, { dateFrom: '2026-11-25' }), NOW);
    const att = (await myRequests(a.tenant.id, p.viewer)).find((r) => r.kind === 'attendance' && r.subject.includes('11-25'))!;
    const t3 = await staff('attendance_staff', { gradeCode: '3' });
    const res = await bulkUpdate(t3.ctx, [r3.id, r5.id, att.id], { status: 'resolved' }, NOW);
    expect(res.changed).toBe(1);
    expect(res.skipped.join(' ')).toMatch(/not allowed/);
    expect(res.skipped.join(' ')).toMatch(/attendance notice/);
    expect(notice.status).toBe('received');
    await expect(updateInboxItem(t3.ctx, r3.id, { assigneeUserId: 'not-a-user' }, NOW)).rejects.toThrow(/active staff/);
  });

  it('families are rate limited and need the inbox module', async () => {
    const p = await family();
    for (let i = 0; i < 10; i++) await createFamilyRequest(a.tenant.id, p.viewer, { kind: 'request', subject: `Request ${i}`, body: 'x' }, NOW);
    await expect(createFamilyRequest(a.tenant.id, p.viewer, { kind: 'request', subject: 'One more', body: 'x' }, NOW)).rejects.toThrow(/several requests/);
  });
});

describe('workflow rules', () => {
  it('auto-accepts only what the rule matches, routes the rest, and counts automation runs', async () => {
    const s = await opsSchool('ops-wf');
    const office = await staff('attendance_staff', {}, s);
    const auto = await createFromTemplate(s.ownerCtx, 'attendance_auto_accept');
    const route = await createFromTemplate(s.ownerCtx, 'attendance_route');
    await updateWorkflow(s.ownerCtx, auto.id, { name: auto.name, enabled: true, sortOrder: 10, config: workflowConfigSchema.parse(auto.config) });
    await updateWorkflow(s.ownerCtx, route.id, { name: route.name, enabled: true, sortOrder: 20, config: { ...workflowConfigSchema.parse(route.config), assigneeUserId: office.userId } });
    const p = await family(s);
    const kid = await child('3', p.membershipId, s);
    const one = await submitNotice(s.tenant.id, p.viewer, absent(kid.id), NOW);
    expect(one.notice.status).toBe('approved');
    const two = await submitNotice(s.tenant.id, p.viewer, absent(kid.id, { dateFrom: '2026-11-18', dateTo: '2026-11-19' }), NOW);
    expect(two.notice.status).toBe('received');
    const items = await withTenant(s.tenant.id, (tx) => tx.select().from(inboxItems));
    expect(items.find((i) => i.id === one.notice.inboxItemId)).toMatchObject({ status: 'resolved', automated: true });
    expect(items.find((i) => i.id === two.notice.inboxItemId)).toMatchObject({ status: 'new', assigneeUserId: office.userId });
    const [c] = await withTenant(s.tenant.id, (tx) => tx.select().from(usageCounters).where(eq(usageCounters.metric, 'automationRunsPerMonth')));
    expect(c!.count).toBe(2);
  });

  it('falls back to the defaults when the automation allowance is used up', async () => {
    const s = await opsSchool('ops-quota');
    await platformDb().update(subscriptions).set({ limitOverrides: { automationRunsPerMonth: 0 } }).where(eq(subscriptions.tenantId, s.tenant.id));
    const auto = await createFromTemplate(s.ownerCtx, 'attendance_auto_accept');
    await updateWorkflow(s.ownerCtx, auto.id, { name: auto.name, enabled: true, sortOrder: 10, config: workflowConfigSchema.parse(auto.config) });
    const p = await family(s);
    const kid = await child('3', p.membershipId, s);
    const r = await submitNotice(s.tenant.id, p.viewer, absent(kid.id), NOW);
    expect(r.notice.status).toBe('received');
  });

  it('skips a tampered rule, refuses unavailable templates and escalates once', async () => {
    const s = await opsSchool('ops-esc');
    await expect(createFromTemplate(s.ownerCtx, 'field_trip_permission')).rejects.toThrow(/not available/);
    const boss = await staff('school_admin', {}, s);
    const w = await createFromTemplate(s.ownerCtx, 'office_request');
    await expect(updateWorkflow(s.ownerCtx, w.id, { name: 'x', enabled: true, sortOrder: 1, config: { ...workflowConfigSchema.parse(w.config), action: 'auto_accept' } })).rejects.toThrow(/Only attendance/);
    await expect(updateWorkflow(s.ownerCtx, w.id, { name: 'x', enabled: true, sortOrder: 1, config: { ...workflowConfigSchema.parse(w.config), escalateToUserId: null } })).rejects.toThrow(/receives escalations/);
    await updateWorkflow(s.ownerCtx, w.id, { name: 'Requests', enabled: true, sortOrder: 1, config: { ...workflowConfigSchema.parse(w.config), escalateAfterHours: 2, escalateToUserId: boss.userId } });
    const p = await family(s);
    const item = await createFamilyRequest(s.tenant.id, p.viewer, { kind: 'request', subject: 'Bus pass', body: 'Need a new one' }, NOW);
    expect(await runEscalations(s.tenant.id, new Date(NOW.getTime() + 3600_000))).toBe(0);
    expect(await runEscalations(s.tenant.id, new Date(NOW.getTime() + 3 * 3600_000))).toBe(1);
    expect(await runEscalations(s.tenant.id, new Date(NOW.getTime() + 5 * 3600_000))).toBe(0);
    const [row] = await withTenant(s.tenant.id, (tx) => tx.select().from(inboxItems).where(eq(inboxItems.id, item.id)));
    expect(row).toMatchObject({ assigneeUserId: boss.userId, priority: 'high' });
    // A row edited outside the app to an unknown action is ignored, not half-applied.
    await withTenant(s.tenant.id, (tx) => tx.update(workflows).set({ config: { action: 'run_shell', match: {} } }).where(eq(workflows.id, w.id)));
    const next = await createFamilyRequest(s.tenant.id, p.viewer, { kind: 'request', subject: 'Another', body: 'x' }, NOW);
    expect(next.workflowId).toBeNull();
  });

  it('rules do nothing when the school does not have the Workflows module', async () => {
    const s = await createSchool('ops-nowf', { enabledModules: ['family_accounts', 'operations_inbox', 'attendance_notices'], status: 'active' });
    await expect(createFromTemplate(s.ownerCtx, 'attendance_route')).rejects.toThrow(/not switched on/);
  });
});
