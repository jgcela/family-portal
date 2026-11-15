// FACTS SIS API client: read-only, used to find a parent's children.
//
// NOT VERIFIED against a live FACTS account. What is known from public
// third-party setup guides (Reach, PlusPortals, Gradelink; November 2026):
// - The API sits behind Azure API Management. Each request carries the
//   vendor's "Ocp-Apim-Subscription-Key" (issued by FACTS to the vendor) and
//   the school's "Facts-Api-Key" (created by the school in FACTS under
//   System > Configuration > API Configuration, with the "People" scope).
// - Endpoints named in those guides: /People, /Students, /People/ParentStudent.
// The base URL, query syntax and response field names are not published.
// They are kept in this one file, read from FACTS_API_BASE_URL, and parsed
// tolerantly, so they can be corrected once FACTS confirms them.
//
// Only GET requests are made. No passwords are involved: the portal account
// is matched to a FACTS person by email, and FACTS returns that person's
// students. Nothing returned is stored except the parent's FACTS person id.

import { field, SisError, str, type SisChild, type SisConnector, type SisPerson } from './connector';

export { field } from './connector';
export type FactsPerson = SisPerson;
export type FactsChild = SisChild;
export type FactsApi = SisConnector;
/** Kept for older imports: FACTS errors are SIS errors. */
export const FactsError = SisError;

type Json = Record<string, unknown>;

/** Accepts a bare array or the usual envelopes ({ results }, { data }, { items }, { value }). */
export function rows(body: unknown): Json[] {
  if (Array.isArray(body)) return body.filter((x): x is Json => !!x && typeof x === 'object');
  if (body && typeof body === 'object') {
    const inner = field(body as Json, 'results', 'data', 'items', 'value');
    if (Array.isArray(inner)) return rows(inner);
  }
  return [];
}

/** FACTS fields that, when present and false, mean this parent must not act for the child. */
const NO_ACCESS_FLAGS = ['custody', 'hasCustody', 'familyPortalAccess', 'parentsWebAccess', 'portalAccess'];

export function parseChild(rel: Json, student: Json | null): FactsChild | null {
  const s = student ?? rel;
  const studentId = str(field(rel, 'studentId', 'studentID')) ?? str(field(s, 'studentId', 'personId'));
  const firstName = str(field(s, 'firstName', 'studentFirstName'));
  const lastName = str(field(s, 'lastName', 'studentLastName'));
  if (!studentId || !firstName || !lastName) return null;
  const canAct = !NO_ACCESS_FLAGS.some((f) => field(rel, f) === false);
  return {
    studentId,
    firstName,
    lastName,
    nickname: str(field(s, 'nickName', 'nickname', 'preferredName')),
    gradeLevel: str(field(s, 'gradeLevel', 'grade', 'currentGradeLevel')),
    canAct,
  };
}

export class HttpFactsApi implements FactsApi {
  constructor(
    private readonly schoolKey: string,
    private readonly opts: { baseUrl?: string; subscriptionKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
  ) {}

  private async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const base = this.opts.baseUrl ?? process.env.FACTS_API_BASE_URL;
    const sub = this.opts.subscriptionKey ?? process.env.FACTS_SUBSCRIPTION_KEY;
    if (!base || !sub) throw new SisError('The FACTS connection is not set up on this platform yet.', 'not_configured');
    if (!/^https:\/\//.test(base)) throw new SisError('FACTS_API_BASE_URL must start with https://', 'not_configured');
    const url = new URL(base.replace(/\/+$/, '') + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await (this.opts.fetch ?? fetch)(url, {
        method: 'GET',
        headers: { 'Ocp-Apim-Subscription-Key': sub, 'Facts-Api-Key': this.schoolKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8000),
        cache: 'no-store',
      });
    } catch {
      throw new SisError('FACTS did not answer in time.', 'unavailable');
    }
    if (res.status === 401 || res.status === 403) throw new SisError('FACTS refused the key. Check the API key and its "People" permission.', 'unauthorized');
    if (res.status === 404) return null;
    if (!res.ok) throw new SisError(`FACTS answered with an error (${res.status}).`, 'unavailable');
    try {
      return await res.json();
    } catch {
      throw new SisError('FACTS sent a response the portal could not read.', 'bad_response');
    }
  }

  async ping() {
    await this.get('/People', { pageSize: '1' });
  }

  async findParentByEmail(email: string): Promise<FactsPerson | null> {
    const e = email.trim().toLowerCase();
    const list = rows(await this.get('/People', { filters: `email==${e}`, pageSize: '5' }));
    // Only an exact, single match counts: two FACTS people with the same email is ambiguous.
    const hits = list.filter((p) => [field(p, 'email', 'email1'), field(p, 'email2')].some((x) => typeof x === 'string' && x.trim().toLowerCase() === e));
    if (hits.length !== 1) return null;
    const personId = str(field(hits[0]!, 'personId', 'personID', 'id'));
    return personId ? { personId, email: e } : null;
  }

  async childrenOf(parentPersonId: string): Promise<FactsChild[]> {
    const rels = rows(await this.get('/People/ParentStudent', { filters: `parentId==${parentPersonId}`, pageSize: '50' })).filter(
      (r) => str(field(r, 'parentId', 'parentID', 'personId')) === parentPersonId,
    );
    const out: FactsChild[] = [];
    for (const rel of rels.slice(0, 20)) {
      const sid = str(field(rel, 'studentId', 'studentID'));
      if (!sid) continue;
      const hasName = !!field(rel, 'firstName', 'studentFirstName');
      const student = hasName ? null : ((await this.get(`/Students/${encodeURIComponent(sid)}`)) as Json | null);
      const c = parseChild(rel, student && typeof student === 'object' ? student : null);
      if (c) out.push(c);
    }
    return out;
  }
}

let override: ((schoolKey: string) => FactsApi) | undefined;

/** Tests replace the HTTP client with a fake FACTS. */
export function setFactsApiForTests(f: ((schoolKey: string) => FactsApi) | undefined) {
  override = f;
}

export function factsApi(schoolKey: string): FactsApi {
  return override ? override(schoolKey) : new HttpFactsApi(schoolKey);
}
