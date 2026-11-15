// Student directory: children come from FACTS (live, never stored), from the
// school's manual list, or from nowhere. Uses a fake FACTS; the HTTP client
// is tested separately against a fake fetch.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { attendanceNotices, directorySettings, grades, inboxItems, memberships, membershipRoles, roles, sisPersonLinks, students, user } from '@/server/db/schema';
import { loadViewer } from '@/server/viewer';
import { loadAuthzContext } from '@/server/rbac/context';
import { submitNotice } from '@/server/services/attendance';
import { createFamilyRequest, listInbox, parseFilters } from '@/server/services/inbox';
import { saveStudent } from '@/server/services/students';
import {
  addBlock,
  childFor,
  clearDirectoryCache,
  DirectoryUnavailableError,
  familyChildren,
  getDirectorySettings,
  gradeToken,
  setPersonLink,
  testFactsConnection,
  updateDirectorySettings,
} from '@/server/services/directory';
import { FactsError, HttpFactsApi, setFactsApiForTests, type FactsApi, type FactsChild } from '@/server/sis/facts';
import { decryptSecret } from '@/server/crypto/secrets';
import { createSchool, createUser } from './helpers';

const OPS = ['family_accounts', 'operations_inbox', 'attendance_notices'];
const NOW = new Date('2026-11-16T15:00:00Z');
const API_KEY = 'school-facts-key-1234';
let key = 0;
const k = () => `dir-key-${++key}-abcdefgh`;

/** A tiny FACTS: parents by email, students by parent. */
type FakeFacts = { people: { personId: string; email: string }[]; kids: Record<string, FactsChild[]>; down?: boolean; seenKeys: string[] };
const fake: FakeFacts = { people: [], kids: {}, seenKeys: [] };
function fakeApi(schoolKey: string): FactsApi {
  fake.seenKeys.push(schoolKey);
  const guard = () => {
    if (fake.down) throw new FactsError('FACTS did not answer in time.', 'unavailable');
  };
  return {
    async ping() {
      guard();
      if (schoolKey !== API_KEY) throw new FactsError('FACTS refused the key.', 'unauthorized');
    },
    async findParentByEmail(email) {
      guard();
      const hits = fake.people.filter((p) => p.email === email.toLowerCase());
      return hits.length === 1 ? { personId: hits[0]!.personId, email } : null;
    },
    async childrenOf(id) {
      guard();
      return fake.kids[id] ?? [];
    },
  };
}
const kid = (studentId: string, firstName: string, gradeLevel: string | null, canAct = true): FactsChild => ({ studentId, firstName, lastName: 'Lopez', nickname: null, gradeLevel, canAct });

let s: Awaited<ReturnType<typeof createSchool>>;

async function family(name = 'Parent', school = s) {
  const userId = await createUser(name);
  const m = await withTenant(school.tenant.id, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId: school.tenant.id, userId, kind: 'family', status: 'active' }).returning();
    return m!;
  });
  const [u] = await platformDb().select().from(user).where(eq(user.id, userId));
  return { userId, membershipId: m.id, email: u!.email, viewer: await loadViewer(school.tenant.id, userId) };
}

async function factsSchool(slug: string) {
  const school = await createSchool(slug, { enabledModules: OPS, status: 'active' });
  await updateDirectorySettings(school.ownerCtx, { source: 'facts', factsApiKey: API_KEY });
  return school;
}

const absent = (studentId: string, extra: Record<string, unknown> = {}) => ({ studentId, type: 'absent', dateFrom: '2026-11-17', dateTo: '', reason: 'illness', comment: '', idempotencyKey: k(), ...extra });

beforeAll(async () => {
  setFactsApiForTests(fakeApi);
  s = await factsSchool('dir-a');
});
afterEach(() => {
  fake.down = false;
  clearDirectoryCache();
});
afterAll(async () => {
  setFactsApiForTests(undefined);
  await closeDb();
});

describe('children from FACTS', () => {
  it('finds the parent by email and shows only their FACTS students, with the grade matched', async () => {
    const p = await family();
    fake.people.push({ personId: '5001', email: p.email });
    fake.kids['5001'] = [kid('9001', 'Ana', '03'), kid('9002', 'Luis', 'K')];
    const kids = await familyChildren(s.tenant.id, p.viewer);
    expect(kids.map((c) => c.key)).toEqual(['facts:9001', 'facts:9002']);
    const [g3] = await withTenant(s.tenant.id, (tx) => tx.select().from(grades).where(eq(grades.code, '3')));
    expect(kids[0]).toMatchObject({ name: 'Ana Lopez', gradeId: g3!.id, studentId: null });
    // The match is remembered (parent's FACTS id only); no student row exists.
    const links = await withTenant(s.tenant.id, (tx) => tx.select().from(sisPersonLinks).where(eq(sisPersonLinks.membershipId, p.membershipId)));
    expect(links).toMatchObject([{ personId: '5001', matchedBy: 'email' }]);
    expect(await withTenant(s.tenant.id, (tx) => tx.select().from(students))).toEqual([]);
    expect(fake.seenKeys.at(-1)).toBe(API_KEY);
  });

  it('a notice for a FACTS child keeps only the key, name and grade; the office sees it in the right grade', async () => {
    const p = await family();
    fake.people.push({ personId: '5002', email: p.email });
    fake.kids['5002'] = [kid('9010', 'Marta', '5')];
    const r = await submitNotice(s.tenant.id, p.viewer, absent('facts:9010'), NOW);
    expect(r.notice).toMatchObject({ studentKey: 'facts:9010', studentName: 'Marta Lopez', studentId: null, status: 'received' });
    const [item] = await withTenant(s.tenant.id, (tx) => tx.select().from(inboxItems).where(eq(inboxItems.id, r.notice.inboxItemId!)));
    expect(item).toMatchObject({ studentKey: 'facts:9010', studentName: 'Marta Lopez' });
    expect(item!.subject).toMatch(/Marta Lopez/);
    // A grade-5 teacher sees it; a grade-3 teacher does not.
    const teacher = async (code: string) => {
      const userId = await createUser(`Teacher ${code}`);
      await withTenant(s.tenant.id, async (tx) => {
        const [m] = await tx.insert(memberships).values({ tenantId: s.tenant.id, userId, kind: 'staff', status: 'active' }).returning();
        const [role] = await tx.select().from(roles).where(eq(roles.key, 'teacher'));
        const [g] = await tx.select().from(grades).where(eq(grades.code, code));
        await tx.insert(membershipRoles).values({ tenantId: s.tenant.id, membershipId: m!.id, roleId: role!.id, scopeType: 'grade', scopeId: g!.id });
      });
      return (await loadAuthzContext(s.tenant.id, userId))!;
    };
    const ids5 = (await listInbox(await teacher('5'), parseFilters({ status: 'all' }), NOW)).map((i) => i.id);
    const ids3 = (await listInbox(await teacher('3'), parseFilters({ status: 'all' }), NOW)).map((i) => i.id);
    expect(ids5).toContain(item!.id);
    expect(ids3).not.toContain(item!.id);
    // The office can search by the child's name.
    expect((await listInbox(s.ownerCtx, parseFilters({ status: 'all', q: 'Marta' }), NOW)).map((i) => i.id)).toContain(item!.id);
  });

  it('nobody can act for a child FACTS does not link to them', async () => {
    const p = await family();
    const stranger = await family('Stranger');
    fake.people.push({ personId: '5003', email: p.email });
    fake.kids['5003'] = [kid('9020', 'Eva', '3')];
    await expect(submitNotice(s.tenant.id, stranger.viewer, absent('facts:9020'), NOW)).rejects.toThrow(/can't send attendance notices/);
    await expect(createFamilyRequest(s.tenant.id, stranger.viewer, { kind: 'request', subject: 'Pick up', body: 'x', studentId: 'facts:9020' }, NOW)).rejects.toThrow(/Choose one of your children/);
    expect(await childFor(s.tenant.id, stranger.viewer, 'facts:9020', 'view')).toBeNull();
    // Malformed keys are refused before anything is looked up.
    expect(await childFor(s.tenant.id, p.viewer, "facts:9020' OR 1=1", 'view')).toBeNull();
  });

  it('an email shared by two FACTS people matches nobody', async () => {
    const p = await family();
    fake.people.push({ personId: '5004', email: p.email }, { personId: '5005', email: p.email });
    expect(await familyChildren(s.tenant.id, p.viewer)).toEqual([]);
  });

  it('FACTS "no custody / no access" and staff blocks hide the child', async () => {
    const p = await family();
    fake.people.push({ personId: '5006', email: p.email });
    fake.kids['5006'] = [kid('9030', 'Ines', '3', false), kid('9031', 'Pablo', '3')];
    expect((await familyChildren(s.tenant.id, p.viewer)).map((c) => c.key)).toEqual(['facts:9031']);
    await expect(addBlock(s.ownerCtx, { membershipId: p.membershipId, factsStudentId: '9031', note: '' })).rejects.toThrow();
    await addBlock(s.ownerCtx, { membershipId: p.membershipId, factsStudentId: '9031', note: 'Court order on file, 2026-10-01' });
    expect(await familyChildren(s.tenant.id, p.viewer)).toEqual([]);
    await expect(submitNotice(s.tenant.id, p.viewer, absent('facts:9031'), NOW)).rejects.toThrow(/can't send/);
  });

  it('when FACTS is down the family gets a clear message, and a retry of a sent notice still works', async () => {
    const p = await family();
    fake.people.push({ personId: '5007', email: p.email });
    fake.kids['5007'] = [kid('9040', 'Rosa', '3')];
    const body = absent('facts:9040');
    const first = await submitNotice(s.tenant.id, p.viewer, body, NOW);
    clearDirectoryCache();
    fake.down = true;
    await expect(familyChildren(s.tenant.id, p.viewer)).rejects.toBeInstanceOf(DirectoryUnavailableError);
    const again = await submitNotice(s.tenant.id, p.viewer, body, NOW);
    expect(again).toMatchObject({ duplicate: true, notice: { id: first.notice.id } });
  });

  it('staff can link a parent whose FACTS email differs', async () => {
    const p = await family();
    fake.kids['5008'] = [kid('9050', 'Tomas', '3')];
    expect(await familyChildren(s.tenant.id, p.viewer)).toEqual([]);
    await setPersonLink(s.ownerCtx, p.membershipId, '5008');
    expect((await familyChildren(s.tenant.id, p.viewer)).map((c) => c.key)).toEqual(['facts:9050']);
    await expect(setPersonLink(s.ownerCtx, p.membershipId, 'bad id!')).rejects.toThrow(/ID from the SIS/);
  });
});

describe('settings and the API key', () => {
  it('stores the key encrypted, never returns it, and binds it to the school', async () => {
    const [row] = await withTenant(s.tenant.id, (tx) => tx.select().from(directorySettings).where(eq(directorySettings.tenantId, s.tenant.id)));
    expect(row!.factsApiKeyEnc).not.toContain(API_KEY);
    expect(decryptSecret(row!.factsApiKeyEnc!, `facts:${s.tenant.id}`)).toBe(API_KEY);
    expect(decryptSecret(row!.factsApiKeyEnc!, 'facts:another-school')).toBeNull();
    const view = await getDirectorySettings(s.ownerCtx);
    expect(JSON.stringify(view)).not.toContain(API_KEY);
    expect(view).toMatchObject({ source: 'facts', hasKey: true, keyHint: '1234' });
  });

  it('records the result of a connection test', async () => {
    const t = await factsSchool('dir-test');
    expect(await testFactsConnection(t.ownerCtx)).toEqual({ ok: true, error: null });
    await updateDirectorySettings(t.ownerCtx, { source: 'facts', factsApiKey: 'a-wrong-key-0000' });
    const r = await testFactsConnection(t.ownerCtx);
    expect(r.ok).toBe(false);
    expect(await getDirectorySettings(t.ownerCtx)).toMatchObject({ status: 'error', lastError: expect.stringMatching(/refused/) });
  });

  it('a new key forgets earlier parent matches', async () => {
    const t = await factsSchool('dir-rekey');
    const p = await family('Rekey parent', t);
    await setPersonLink(t.ownerCtx, p.membershipId, '7001');
    await updateDirectorySettings(t.ownerCtx, { source: 'facts', factsApiKey: 'another-key-5678' });
    expect(await withTenant(t.tenant.id, (tx) => tx.select().from(sisPersonLinks))).toEqual([]);
  });

  it('needs integrations.manage, and a key before choosing FACTS', async () => {
    const t = await createSchool('dir-perm', { enabledModules: OPS, status: 'active' });
    await expect(updateDirectorySettings(t.ownerCtx, { source: 'facts' })).rejects.toThrow(/API key/);
    const userId = await createUser('Teacher');
    await withTenant(t.tenant.id, async (tx) => {
      const [m] = await tx.insert(memberships).values({ tenantId: t.tenant.id, userId, kind: 'staff', status: 'active' }).returning();
      const [role] = await tx.select().from(roles).where(eq(roles.key, 'teacher'));
      await tx.insert(membershipRoles).values({ tenantId: t.tenant.id, membershipId: m!.id, roleId: role!.id, scopeType: 'school', scopeId: null });
    });
    const ctx = (await loadAuthzContext(t.tenant.id, userId))!;
    await expect(updateDirectorySettings(ctx, { source: 'manual' })).rejects.toThrow(/integrations.manage/);
    await expect(getDirectorySettings(ctx)).rejects.toThrow(/integrations.manage/);
  });

  it('with no source, families have no children and the manual list is locked', async () => {
    const t = await createSchool('dir-none', { enabledModules: OPS, status: 'active' });
    const p = await family('None parent', t);
    expect(await familyChildren(t.tenant.id, p.viewer)).toEqual([]);
    await expect(saveStudent(t.ownerCtx, null, { firstName: 'A', lastName: 'B' })).rejects.toThrow(/manual student list is switched off/);
    await updateDirectorySettings(t.ownerCtx, { source: 'manual' });
    await expect(saveStudent(t.ownerCtx, null, { firstName: 'A', lastName: 'B' })).resolves.toMatchObject({ firstName: 'A' });
    expect(await withTenant(t.tenant.id, (tx) => tx.select().from(attendanceNotices))).toEqual([]);
  });
});

describe('grade matching', () => {
  it('reads common FACTS grade labels', () => {
    expect(['3', '03', '3rd', 'Grade 3', 'gr. 3'].map(gradeToken)).toEqual(['3', '3', '3', '3', '3']);
    expect(['K', 'KG', 'Kindergarten', '0'].map(gradeToken)).toEqual(['k', 'k', 'k', 'k']);
    expect(['PK', 'Pre-K', 'TK'].map(gradeToken)).toEqual(['pk', 'pk', 'pk']);
  });
});

describe('FACTS HTTP client', () => {
  type Call = { url: string; init: RequestInit };
  const make = (respond: (url: URL) => { status: number; body?: unknown }) => {
    const calls: Call[] = [];
    const f = (async (input: URL | string, init: RequestInit) => {
      calls.push({ url: String(input), init });
      const r = respond(new URL(String(input)));
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { calls, api: new HttpFactsApi('school-key', { baseUrl: 'https://facts.example.test/api/v1/', subscriptionKey: 'vendor-sub', fetch: f }) };
  };

  it('sends both keys on read-only requests and parses envelopes and field spellings', async () => {
    const { calls, api } = make((u) => {
      if (u.pathname.endsWith('/People')) return { status: 200, body: { results: [{ PersonID: 77, Email: 'Mom@Example.test' }] } };
      if (u.pathname.endsWith('/People/ParentStudent')) return { status: 200, body: [{ parentID: '77', studentID: '501', custody: true }, { parentID: '77', studentID: '502', custody: false }] };
      if (u.pathname.endsWith('/Students/501')) return { status: 200, body: { studentId: 501, firstName: 'Ana', lastName: 'Ruiz', gradeLevel: '2' } };
      if (u.pathname.endsWith('/Students/502')) return { status: 200, body: { studentId: 502, firstName: 'Leo', lastName: 'Ruiz', gradeLevel: '4' } };
      return { status: 404 };
    });
    expect(await api.findParentByEmail('mom@example.test')).toEqual({ personId: '77', email: 'mom@example.test' });
    const kids = await api.childrenOf('77');
    expect(kids).toEqual([
      { studentId: '501', firstName: 'Ana', lastName: 'Ruiz', nickname: null, gradeLevel: '2', canAct: true },
      { studentId: '502', firstName: 'Leo', lastName: 'Ruiz', nickname: null, gradeLevel: '4', canAct: false },
    ]);
    for (const c of calls) {
      expect(c.init.method).toBe('GET');
      expect(c.url.startsWith('https://facts.example.test/api/v1/')).toBe(true);
      expect((c.init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('vendor-sub');
      expect((c.init.headers as Record<string, string>)['Facts-Api-Key']).toBe('school-key');
    }
  });

  it('ignores relations for other parents and reports refused keys and outages', async () => {
    const { api } = make((u) => (u.pathname.endsWith('/ParentStudent') ? { status: 200, body: [{ parentId: '1', studentId: '9', firstName: 'X', lastName: 'Y' }] } : { status: 200, body: [] }));
    expect(await api.childrenOf('2')).toEqual([]);
    const refused = make(() => ({ status: 401 })).api;
    await expect(refused.ping()).rejects.toMatchObject({ kind: 'unauthorized' });
    const broken = make(() => ({ status: 503 })).api;
    await expect(broken.findParentByEmail('a@b.test')).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(new HttpFactsApi('k', { baseUrl: 'http://insecure.test', subscriptionKey: 's' }).ping()).rejects.toMatchObject({ kind: 'not_configured' });
    await expect(new HttpFactsApi('k', { baseUrl: undefined, subscriptionKey: undefined }).ping()).rejects.toMatchObject({ kind: 'not_configured' });
  });
});
