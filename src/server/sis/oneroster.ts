// OneRoster connector: read a parent's children from any SIS with a
// OneRoster 1.1 or 1.2 REST API (PowerSchool, Infinite Campus, Skyward…).
//
// NOT VERIFIED against a live district. Built from the 1EdTech OneRoster
// specification and public integration guides (Microsoft School Data Sync,
// November 2026):
// - Auth: OAuth 2.0 client credentials. The district creates the client in
//   its SIS; the portal gets an access token from the district's token URL.
//   OAuth 1.0a signing is not supported (OneRoster 1.2 removed it).
// - Paths: 1.1 under /ims/oneroster/v1p1, 1.2 under /ims/oneroster/rostering/v1p2.
// - Parents and guardians are users (role parent, guardian or relative);
//   "agents" on a user record links parents and students. Some districts
//   do not publish contacts at all, and some only list the link on the
//   student's record. The connection test tells staff when no parent
//   records come back.
//
// Data requests are GET only. The only POST is to the token URL.
import { field, SisError, SIS_ID, str, type SisChild, type SisConnector, type SisPerson } from './connector';

export type OneRosterVersion = 'v1p1' | 'v1p2';
export type OneRosterConfig = { version: OneRosterVersion; baseUrl: string; tokenUrl: string; clientId: string };

type Json = Record<string, unknown>;
const PARENT_ROLES = new Set(['parent', 'guardian', 'relative']);

/** The API root for a base URL the district gives ("https://sis.example.org/api" or the full OneRoster path). */
export function apiRoot(c: Pick<OneRosterConfig, 'baseUrl' | 'version'>) {
  const b = c.baseUrl.replace(/\/+$/, '');
  if (/\/ims\/oneroster\//.test(b)) return b;
  return c.version === 'v1p2' ? `${b}/ims/oneroster/rostering/v1p2` : `${b}/ims/oneroster/v1p1`;
}

/** Roles of a user in either version: 1.1 has "role", 1.2 has "roles": [{ role }]. */
export function rolesOf(u: Json): string[] {
  const one = str(field(u, 'role'));
  const many = field(u, 'roles');
  const out = one ? [one] : [];
  if (Array.isArray(many)) for (const r of many) if (r && typeof r === 'object') { const v = str(field(r as Json, 'role')); if (v) out.push(v); }
  return out.map((r) => r.toLowerCase());
}

function isActive(u: Json) {
  const status = str(field(u, 'status'));
  const enabled = field(u, 'enabledUser');
  return (!status || status.toLowerCase() === 'active') && enabled !== false && enabled !== 'false';
}

export function parseStudent(u: Json): SisChild | null {
  const studentId = str(field(u, 'sourcedId'));
  const firstName = str(field(u, 'givenName'));
  const lastName = str(field(u, 'familyName'));
  if (!studentId || !SIS_ID.test(studentId) || !firstName || !lastName) return null;
  if (!rolesOf(u).includes('student') || !isActive(u)) return null;
  const grades = field(u, 'grades');
  return {
    studentId,
    firstName,
    lastName,
    nickname: str(field(u, 'preferredFirstName', 'preferredGivenName')),
    gradeLevel: Array.isArray(grades) ? str(grades[0]) : str(grades),
    // OneRoster has no custody flag: staff blocks in the portal cover those cases.
    canAct: true,
  };
}

const tokens = new Map<string, { token: string; until: number }>();

export function clearOneRosterTokens() {
  tokens.clear();
}

export class HttpOneRosterApi implements SisConnector {
  constructor(
    private readonly config: OneRosterConfig,
    private readonly secret: string,
    private readonly opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
  ) {
    for (const u of [config.baseUrl, config.tokenUrl]) if (!/^https:\/\//.test(u)) throw new SisError('The OneRoster addresses must start with https://', 'not_configured');
  }

  private get f() {
    return this.opts.fetch ?? fetch;
  }

  private async token(fresh = false): Promise<string> {
    const k = `${this.config.tokenUrl}|${this.config.clientId}`;
    const hit = tokens.get(k);
    if (!fresh && hit && hit.until > Date.now()) return hit.token;
    const body = new URLSearchParams({ grant_type: 'client_credentials' });
    if (this.config.version === 'v1p2') body.set('scope', 'https://purl.imsglobal.org/spec/or/v1p2/scope/roster-core.readonly');
    let res: Response;
    try {
      res = await this.f(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.secret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8000),
        cache: 'no-store',
      });
    } catch {
      throw new SisError('The SIS sign-in address did not answer in time.', 'unavailable');
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new SisError('The SIS refused the client ID or secret.', 'unauthorized');
    if (!res.ok) throw new SisError(`The SIS sign-in address answered with an error (${res.status}).`, 'unavailable');
    const j = (await res.json().catch(() => null)) as Json | null;
    const t = j && str(field(j, 'access_token'));
    if (!t) throw new SisError('The SIS did not return an access token.', 'bad_response');
    const ttl = Number(j && field(j, 'expires_in')) || 3600;
    tokens.set(k, { token: t, until: Date.now() + Math.max(30, ttl - 60) * 1000 });
    return t;
  }

  private async get(path: string, params: Record<string, string> = {}, retry = true): Promise<Json | null> {
    const url = new URL(apiRoot(this.config) + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.f(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${await this.token(!retry)}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8000),
        cache: 'no-store',
      });
    } catch (err) {
      if (err instanceof SisError) throw err;
      throw new SisError('The SIS did not answer in time.', 'unavailable');
    }
    // An expired token: get a new one once.
    if (res.status === 401 && retry) return this.get(path, params, false);
    if (res.status === 401 || res.status === 403) throw new SisError('The SIS refused access. Check that the client may read users.', 'unauthorized');
    if (res.status === 404) return null;
    if (!res.ok) throw new SisError(`The SIS answered with an error (${res.status}).`, 'unavailable');
    const j = await res.json().catch(() => undefined);
    if (!j || typeof j !== 'object') throw new SisError('The SIS sent a response the portal could not read.', 'bad_response');
    return j as Json;
  }

  private list(body: Json | null): Json[] {
    const v = body ? field(body, 'users') : null;
    return Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object') : [];
  }

  private async user(id: string): Promise<Json | null> {
    if (!SIS_ID.test(id)) return null;
    const body = await this.get(`/users/${encodeURIComponent(id)}`);
    const u = body ? field(body, 'user') : null;
    return u && typeof u === 'object' ? (u as Json) : null;
  }

  async ping() {
    await this.get('/users', { limit: '1' });
    if (this.config.version !== 'v1p1') return;
    // 1.1 can filter by role: tell staff early when the district publishes no parents.
    try {
      const parents = this.list(await this.get('/users', { limit: '1', filter: "role='parent' OR role='guardian'" }));
      if (!parents.length) return { note: 'Connected, but no parent or guardian records came back. Ask your SIS administrator to include contacts in the OneRoster API.' };
    } catch {
      // Some servers reject OR filters; the first read already proved the connection.
    }
  }

  async findParentByEmail(email: string): Promise<SisPerson | null> {
    const e = email.trim().toLowerCase();
    // Emails with quotes cannot be put safely in a OneRoster filter.
    if (!e || /['"\\]/.test(e)) return null;
    const hits = this.list(await this.get('/users', { filter: `email='${e}'`, limit: '5' })).filter(
      (u) => str(field(u, 'email'))?.toLowerCase() === e && isActive(u) && rolesOf(u).some((r) => PARENT_ROLES.has(r)),
    );
    if (hits.length !== 1) return null;
    const personId = str(field(hits[0]!, 'sourcedId'));
    return personId && SIS_ID.test(personId) ? { personId, email: e } : null;
  }

  async childrenOf(parentPersonId: string): Promise<SisChild[]> {
    const parent = await this.user(parentPersonId);
    if (!parent || !isActive(parent)) return [];
    const agents = field(parent, 'agents');
    const ids = (Array.isArray(agents) ? agents : [])
      .map((a) => (a && typeof a === 'object' ? str(field(a as Json, 'sourcedId')) : null))
      .filter((x): x is string => !!x && SIS_ID.test(x));
    const out: SisChild[] = [];
    for (const id of [...new Set(ids)].slice(0, 20)) {
      const s = await this.user(id);
      if (!s) continue;
      // The link must hold from the student's side too, when the SIS lists it there.
      const back = field(s, 'agents');
      if (Array.isArray(back) && back.length && !back.some((a) => a && typeof a === 'object' && str(field(a as Json, 'sourcedId')) === parentPersonId)) continue;
      const c = parseStudent(s);
      if (c) out.push(c);
    }
    return out;
  }
}

let override: ((config: OneRosterConfig, secret: string) => SisConnector) | undefined;

/** Tests replace the HTTP client with a fake SIS. */
export function setOneRosterApiForTests(f: ((config: OneRosterConfig, secret: string) => SisConnector) | undefined) {
  override = f;
}

export function oneRosterApi(config: OneRosterConfig, secret: string): SisConnector {
  return override ? override(config, secret) : new HttpOneRosterApi(config, secret);
}
