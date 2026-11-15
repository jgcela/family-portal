// OneRoster connector (PowerSchool, Infinite Campus…): a fake district API
// that speaks OneRoster 1.1 or 1.2, the HTTP client against it, and the
// student directory reading a family's children through it.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { directorySettings, grades, memberships, sisPersonLinks, students, user } from '@/server/db/schema';
import { loadViewer } from '@/server/viewer';
import { submitNotice } from '@/server/services/attendance';
import { addBlock, childFor, clearDirectoryCache, familyChildren, getDirectorySettings, setPersonLink, testConnection, updateDirectorySettings } from '@/server/services/directory';
import { apiRoot, clearOneRosterTokens, HttpOneRosterApi, rolesOf, setOneRosterApiForTests, type OneRosterConfig } from '@/server/sis/oneroster';
import { CAPABILITIES, PROVIDERS } from '@/server/sis/connector';
import { decryptSecret } from '@/server/crypto/secrets';
import { createSchool, createUser } from './helpers';

const NOW = new Date('2026-11-16T15:00:00Z');
const SECRET = 'district-client-secret-9876';
type U = Record<string, unknown>;

/** A tiny district OneRoster API. Records every request. */
class FakeDistrict {
  users: U[] = [];
  calls: { method: string; url: string; auth: string | null; body: string | null }[] = [];
  expireNext = false;
  issued = 0;
  constructor(public version: 'v1p1' | 'v1p2' = 'v1p1') {}
  role(r: string): U {
    return this.version === 'v1p1' ? { role: r } : { roles: [{ roleType: 'primary', role: r, org: { sourcedId: 'org1' } }] };
  }
  parent(id: string, email: string, kids: string[], extra: U = {}) {
    this.users.push({ sourcedId: id, status: 'active', enabledUser: true, givenName: 'Pat', familyName: 'Parent', email, ...this.role('parent'), agents: kids.map((k) => ({ sourcedId: k, type: 'user', href: `x/${k}` })), ...extra });
  }
  student(id: string, first: string, grade: string, parents: string[], extra: U = {}) {
    this.users.push({ sourcedId: id, status: 'active', enabledUser: 'true', givenName: first, familyName: 'Rivera', email: `${id}@kids.test`, grades: [grade], ...this.role('student'), agents: parents.map((p) => ({ sourcedId: p, type: 'user' })), ...extra });
  }
  root = () => (this.version === 'v1p2' ? '/api/ims/oneroster/rostering/v1p2' : '/api/ims/oneroster/v1p1');
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    this.calls.push({ method: init?.method ?? 'GET', url: url.toString(), auth: headers.get('authorization'), body: init?.body ? String(init.body) : null });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/oauth/token') {
      if (headers.get('authorization') !== `Basic ${Buffer.from(`district-client:${SECRET}`).toString('base64')}`) return json(401, { error: 'invalid_client' });
      return json(200, { access_token: `tok-${++this.issued}`, token_type: 'bearer', expires_in: 3600 });
    }
    if (!headers.get('authorization')?.startsWith('Bearer tok-')) return json(401, {});
    if (this.expireNext) {
      this.expireNext = false;
      return json(401, {});
    }
    const path = url.pathname.slice(this.root().length);
    if (path === '/users') {
      const f = url.searchParams.get('filter') ?? '';
      let list = this.users;
      const em = f.match(/^email='(.*)'$/);
      if (em) list = list.filter((u) => u.email === em[1]);
      if (f.startsWith('role=')) list = list.filter((u) => ['parent', 'guardian'].includes(String(u.role)));
      return json(200, { users: list.slice(0, Number(url.searchParams.get('limit') ?? 100)) });
    }
    const one = path.match(/^\/users\/(.+)$/);
    if (one) {
      const u = this.users.find((x) => x.sourcedId === decodeURIComponent(one[1]!));
      return u ? json(200, { user: u }) : json(404, {});
    }
    return json(404, {});
  };
}

const cfg = (version: 'v1p1' | 'v1p2' = 'v1p1'): OneRosterConfig => ({ version, baseUrl: 'https://sis.district.test/api', tokenUrl: 'https://sis.district.test/oauth/token', clientId: 'district-client' });

afterEach(() => {
  clearOneRosterTokens();
  clearDirectoryCache();
});

describe('OneRoster HTTP client', () => {
  for (const version of ['v1p1', 'v1p2'] as const) {
    it(`${version}: finds a parent by email and reads their students through "agents"`, async () => {
      const d = new FakeDistrict(version);
      d.parent('p1', 'pat@family.test', ['s1', 's2', 's3', 'p9']);
      d.student('s1', 'Ana', '03', ['p1']);
      d.student('s2', 'Leo', 'KG', ['p1']);
      d.student('s3', 'Old', '05', ['p1'], { status: 'tobedeleted' });
      d.parent('p9', 'other@family.test', []);
      const api = new HttpOneRosterApi(cfg(version), SECRET, { fetch: d.fetch });
      const p = await api.findParentByEmail('Pat@Family.test');
      expect(p).toEqual({ personId: 'p1', email: 'pat@family.test' });
      const kids = await api.childrenOf('p1');
      expect(kids.map((k) => [k.studentId, k.firstName, k.gradeLevel])).toEqual([
        ['s1', 'Ana', '03'],
        ['s2', 'Leo', 'KG'],
      ]);
      // Token: client credentials with Basic auth, and the read-only scope on 1.2.
      const tok = d.calls.filter((c) => c.url.endsWith('/oauth/token'));
      expect(tok).toHaveLength(1);
      expect(tok[0]!.method).toBe('POST');
      expect(tok[0]!.body).toContain('grant_type=client_credentials');
      if (version === 'v1p2') expect(decodeURIComponent(tok[0]!.body!)).toContain('scope=https://purl.imsglobal.org/spec/or/v1p2/scope/roster-core.readonly');
      // Every data request is a GET with a bearer token; the secret never leaves in a data request.
      const data = d.calls.filter((c) => !c.url.endsWith('/oauth/token'));
      expect(data.every((c) => c.method === 'GET' && c.auth === 'Bearer tok-1' && c.url.startsWith(`https://sis.district.test${d.root()}/users`))).toBe(true);
      expect(JSON.stringify(data)).not.toContain(SECRET);
    });
  }

  it('only an active parent with exactly one email match counts', async () => {
    const d = new FakeDistrict();
    d.parent('p1', 'twice@family.test', []);
    d.parent('p2', 'twice@family.test', []);
    d.student('s1', 'Kid', '1', [], { email: 'kid@family.test' });
    d.parent('p3', 'gone@family.test', [], { status: 'tobedeleted' });
    const api = new HttpOneRosterApi(cfg(), SECRET, { fetch: d.fetch });
    expect(await api.findParentByEmail('twice@family.test')).toBeNull();
    expect(await api.findParentByEmail('kid@family.test')).toBeNull();
    expect(await api.findParentByEmail('gone@family.test')).toBeNull();
    const before = d.calls.length;
    expect(await api.findParentByEmail("x'or'1'='1@family.test")).toBeNull();
    expect(d.calls.length).toBe(before);
  });

  it('skips a student whose own record lists other parents only', async () => {
    const d = new FakeDistrict();
    d.parent('p1', 'pat@family.test', ['s1', 's2']);
    d.student('s1', 'Mine', '2', ['p1', 'p5']);
    d.student('s2', 'NotMine', '2', ['p5']);
    const kids = await new HttpOneRosterApi(cfg(), SECRET, { fetch: d.fetch }).childrenOf('p1');
    expect(kids.map((k) => k.firstName)).toEqual(['Mine']);
  });

  it('gets a new token once when the old one expires, and reports a wrong secret as refused', async () => {
    const d = new FakeDistrict();
    d.parent('p1', 'pat@family.test', []);
    const api = new HttpOneRosterApi(cfg(), SECRET, { fetch: d.fetch });
    await api.findParentByEmail('pat@family.test');
    d.expireNext = true;
    expect(await api.findParentByEmail('pat@family.test')).not.toBeNull();
    expect(d.issued).toBe(2);
    clearOneRosterTokens();
    await expect(new HttpOneRosterApi(cfg(), 'wrong', { fetch: d.fetch }).ping()).rejects.toThrow(/refused the client ID or secret/);
  });

  it('refuses plain http addresses and builds the API root for either version', () => {
    expect(() => new HttpOneRosterApi({ ...cfg(), baseUrl: 'http://sis.test' }, SECRET)).toThrow(/https/);
    expect(apiRoot({ baseUrl: 'https://x.test/api/', version: 'v1p1' })).toBe('https://x.test/api/ims/oneroster/v1p1');
    expect(apiRoot({ baseUrl: 'https://x.test/api', version: 'v1p2' })).toBe('https://x.test/api/ims/oneroster/rostering/v1p2');
    expect(apiRoot({ baseUrl: 'https://x.test/ims/oneroster/v1p1', version: 'v1p2' })).toBe('https://x.test/ims/oneroster/v1p1');
    expect(rolesOf({ roles: [{ role: 'Guardian' }, { role: 'teacher' }] })).toEqual(['guardian', 'teacher']);
  });

  it('the connection test warns when the district publishes no parents (1.1)', async () => {
    const d = new FakeDistrict();
    d.student('s1', 'Kid', '1', []);
    expect(await new HttpOneRosterApi(cfg(), SECRET, { fetch: d.fetch }).ping()).toMatchObject({ note: expect.stringMatching(/no parent or guardian records/) });
    d.parent('p1', 'pat@family.test', []);
    expect(await new HttpOneRosterApi(cfg(), SECRET, { fetch: d.fetch }).ping()).toBeUndefined();
  });
});

describe('capabilities', () => {
  it('each connector declares only what is built: children yes; sign-in, attendance write, grades and schedules no', () => {
    for (const p of Object.values(PROVIDERS)) {
      expect(Object.keys(p.capabilities).sort()).toEqual(CAPABILITIES.map((c) => c.id).sort());
      expect(p.capabilities.family_children).toBe('available');
      for (const c of ['parent_sign_in', 'attendance_write', 'grades', 'schedules'] as const) expect(p.capabilities[c]).toBe('not_available');
      expect(p.verified).toBe(false);
    }
  });
});

describe('student directory through OneRoster', () => {
  const d = new FakeDistrict('v1p2');
  let school: Awaited<ReturnType<typeof createSchool>>;
  const form = { product: 'powerschool', version: 'v1p2', baseUrl: 'https://sis.district.test/api', tokenUrl: 'https://sis.district.test/oauth/token', clientId: 'district-client', clientSecret: SECRET };

  async function family(name: string) {
    const userId = await createUser(name);
    const m = (await withTenant(school.tenant.id, (tx) => tx.insert(memberships).values({ tenantId: school.tenant.id, userId, kind: 'family', status: 'active' }).returning()))[0]!;
    const [u] = await platformDb().select().from(user).where(eq(user.id, userId));
    return { membershipId: m.id, email: u!.email, viewer: await loadViewer(school.tenant.id, userId) };
  }

  beforeAll(async () => {
    setOneRosterApiForTests((c, secret) => new HttpOneRosterApi(c, secret, { fetch: d.fetch }));
    school = await createSchool('or-a', { enabledModules: ['family_accounts', 'operations_inbox', 'attendance_notices'], status: 'active' });
  });
  afterAll(async () => {
    setOneRosterApiForTests(undefined);
    await closeDb();
  });

  it('validates the form, stores the secret encrypted and never shows it back', async () => {
    await expect(updateDirectorySettings(school.ownerCtx, { source: 'oneroster' })).rejects.toThrow(/OneRoster connection details/);
    await expect(updateDirectorySettings(school.ownerCtx, { source: 'oneroster', oneroster: { ...form, baseUrl: 'http://sis.district.test' } })).rejects.toThrow(/https/);
    await expect(updateDirectorySettings(school.ownerCtx, { source: 'oneroster', oneroster: { ...form, clientSecret: '' } })).rejects.toThrow(/client secret/);
    await updateDirectorySettings(school.ownerCtx, { source: 'oneroster', oneroster: form });
    const [row] = await withTenant(school.tenant.id, (tx) => tx.select().from(directorySettings));
    expect(row!.onerosterSecretEnc).not.toContain(SECRET);
    expect(decryptSecret(row!.onerosterSecretEnc!, `oneroster:${school.tenant.id}`)).toBe(SECRET);
    // Bound to this school: another school's context can't open it.
    expect(decryptSecret(row!.onerosterSecretEnc!, 'oneroster:other-school')).toBeNull();
    const view = await getDirectorySettings(school.ownerCtx);
    expect(view).toMatchObject({ source: 'oneroster', provider: 'oneroster', hasSecret: true, secretHint: '9876', oneroster: { clientId: 'district-client', version: 'v1p2' } });
    expect(JSON.stringify(view)).not.toContain(SECRET);
    // Saving again without a secret keeps the saved one.
    await updateDirectorySettings(school.ownerCtx, { source: 'oneroster', oneroster: { ...form, clientSecret: '' } });
    expect((await getDirectorySettings(school.ownerCtx)).hasSecret).toBe(true);
  });

  it('the connection test records the result', async () => {
    d.parent('p0', 'nobody@family.test', []);
    expect(await testConnection(school.ownerCtx)).toMatchObject({ ok: true, provider: 'oneroster' });
    expect(await getDirectorySettings(school.ownerCtx)).toMatchObject({ status: 'connected' });
  });

  it('a family sees only their OneRoster children and can send a notice; nothing about students is stored', async () => {
    const p = await family('Rivera parent');
    const other = await family('Other parent');
    d.parent('p1', p.email, ['s1', 's2']);
    d.student('s1', 'Ana', '03', ['p1']);
    d.student('s2', 'Leo', 'KG', ['p1']);
    d.parent('p2', other.email, ['s9']);
    d.student('s9', 'Zoe', '04', ['p2']);
    const kids = await familyChildren(school.tenant.id, p.viewer);
    expect(kids.map((k) => k.key)).toEqual(['oneroster:s1', 'oneroster:s2']);
    const [g3] = await withTenant(school.tenant.id, (tx) => tx.select().from(grades).where(eq(grades.code, '3')));
    expect(kids[0]).toMatchObject({ name: 'Ana Rivera', gradeId: g3!.id });
    expect(await childFor(school.tenant.id, p.viewer, 'oneroster:s9', 'submit_attendance')).toBeNull();
    expect(await childFor(school.tenant.id, p.viewer, 'facts:s1', 'submit_attendance')).toBeNull();
    const r = await submitNotice(
      school.tenant.id,
      p.viewer,
      { studentId: 'oneroster:s1', type: 'absent', dateFrom: '2026-11-17', dateTo: '', reason: 'illness', comment: '', idempotencyKey: 'or-notice-1-abcdef' },
      NOW,
    );
    expect(r.notice).toMatchObject({ studentKey: 'oneroster:s1', studentName: 'Ana Rivera', studentId: null });
    expect(await withTenant(school.tenant.id, (tx) => tx.select().from(students))).toEqual([]);
    const links = await withTenant(school.tenant.id, (tx) => tx.select().from(sisPersonLinks).where(eq(sisPersonLinks.membershipId, p.membershipId)));
    expect(links).toMatchObject([{ provider: 'oneroster', personId: 'p1', matchedBy: 'email' }]);
  });

  it('staff blocks and manual person links work with OneRoster ids', async () => {
    const p = await family('Custody parent');
    d.parent('p7', 'different@sis.test', ['s7']);
    d.student('s7', 'Mia', '2', ['p7']);
    expect(await familyChildren(school.tenant.id, p.viewer)).toEqual([]);
    await setPersonLink(school.ownerCtx, p.membershipId, 'p7');
    clearDirectoryCache();
    expect((await familyChildren(school.tenant.id, p.viewer)).map((k) => k.key)).toEqual(['oneroster:s7']);
    await addBlock(school.ownerCtx, { membershipId: p.membershipId, studentId: 's7', note: 'Court order on file, 2026-10-01' });
    expect(await familyChildren(school.tenant.id, p.viewer)).toEqual([]);
  });
});
