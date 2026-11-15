// Student directory: which children a family account may act for.
//
// One question, answered from the school's chosen source:
// - facts, oneroster: read live from the SIS each time (cached a few
//           minutes in memory) through a read-only connector (sis/).
//           The portal keeps no copy of the students; notices and requests
//           keep only the child's key, name and grade at that moment.
// - manual: the school's own list (students + student_guardians).
// - none:   no children; absence notices are not available.
//
// Every family-side action resolves the child through childFor(), so access
// is decided by the server from the source of truth, never by the browser
// or the AI. Staff blocks (custody orders) apply on top of what the SIS says.
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { directoryBlocks, directorySettings, grades, memberships, sisPersonLinks, studentGuardians, students, user } from '../db/schema';
import { audit } from '../audit/log';
import { can, type AuthzContext } from '../rbac/authorize';
import { decryptSecret, encryptSecret } from '../crypto/secrets';
import { factsApi } from '../sis/facts';
import { oneRosterApi, type OneRosterConfig } from '../sis/oneroster';
import { PROVIDERS, SIS_ID, SisError, type ProviderId, type SisChild, type SisConnector } from '../sis/connector';
import { ValidationError } from './modules';
import { assertFamily, assertStaff, deny, studentName, UUID, type FamilyViewer } from './ops-common';
import type { Viewer } from '../viewer';

export type Source = 'none' | 'manual' | ProviderId;
const isSis = (s: Source): s is ProviderId => s === 'facts' || s === 'oneroster';

export type Child = {
  /** "manual:<uuid>", "facts:<id>" or "oneroster:<sourcedId>" */
  key: string;
  name: string;
  gradeId: string | null;
  grade: string | null;
  canSubmitAttendance: boolean;
  canView: boolean;
  /** Set for children on the manual list only. */
  studentId: string | null;
};

export class DirectoryUnavailableError extends ValidationError {
  constructor(message = 'We couldn\'t reach the school\'s student records just now. Please try again later or call the office.') {
    super(message);
    this.name = 'DirectoryUnavailableError';
  }
}

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; children: Child[] }>();

/** Clears cached children (after a block, a key change or in tests). */
export function clearDirectoryCache(tenantId?: string) {
  if (!tenantId) return cache.clear();
  for (const k of cache.keys()) if (k.startsWith(`${tenantId}:`)) cache.delete(k);
}

export async function settings(tx: Tx, tenantId: string) {
  const [s] = await tx.select().from(directorySettings).where(eq(directorySettings.tenantId, tenantId));
  return s ?? { tenantId, source: 'none' as Source, factsApiKeyEnc: null, factsApiKeyHint: null, factsStatus: 'not_configured' as const, factsCheckedAt: null, factsLastError: null, onerosterConfig: null, onerosterSecretEnc: null, onerosterSecretHint: null, gradeMap: {}, updatedByUserId: null, updatedAt: new Date(0) };
}

export async function directorySource(tenantId: string, db: Db = platformDb()): Promise<Source> {
  return withTenant(tenantId, async (tx) => (await settings(tx, tenantId)).source, db);
}

const keyContext = (tenantId: string) => `facts:${tenantId}`;
const secretContext = (tenantId: string) => `oneroster:${tenantId}`;

type Settings = Awaited<ReturnType<typeof settings>>;

/** The connector for the school's chosen SIS, or null when its credentials are not saved. */
function connectorFor(tenantId: string, s: Settings, provider: ProviderId): SisConnector | null {
  if (provider === 'facts') {
    const key = s.factsApiKeyEnc ? decryptSecret(s.factsApiKeyEnc, keyContext(tenantId)) : null;
    return key ? factsApi(key) : null;
  }
  const secret = s.onerosterSecretEnc ? decryptSecret(s.onerosterSecretEnc, secretContext(tenantId)) : null;
  if (!secret || !s.onerosterConfig) return null;
  const { version, baseUrl, tokenUrl, clientId } = s.onerosterConfig;
  return oneRosterApi({ version, baseUrl, tokenUrl, clientId } satisfies OneRosterConfig, secret);
}

/** "3", "03", "3rd", "Grade 3", "K", "Kindergarten", "PK", "Pre-K" → a comparable token. */
export function gradeToken(s: string): string {
  const t = s.toLowerCase().replace(/grade|gr\.|level/g, '').replace(/[^a-z0-9]/g, '');
  if (['k', 'kg', 'kinder', 'kindergarten', '0', '00'].includes(t)) return 'k';
  if (['pk', 'prek', 'prekindergarten', 'tk', 'preschool'].includes(t)) return 'pk';
  const n = t.match(/^0*(\d{1,2})(st|nd|rd|th)?$/);
  return n ? String(Number(n[1])) : t;
}

async function gradeMatcher(tx: Tx, map: Record<string, string>) {
  const all = await tx.select({ id: grades.id, code: grades.code, name: grades.name }).from(grades);
  return (level: string | null) => {
    if (!level) return null;
    const mapped = map[level];
    const byMap = mapped ? all.find((g) => g.id === mapped) : undefined;
    if (byMap) return byMap;
    const t = gradeToken(level);
    return all.find((g) => gradeToken(g.code) === t) ?? all.find((g) => gradeToken(g.name) === t) ?? null;
  };
}

async function manualChildren(tx: Tx, v: FamilyViewer): Promise<Child[]> {
  const rows = await tx
    .select({ s: students, g: studentGuardians, grade: grades.name })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .leftJoin(grades, eq(grades.id, students.gradeId))
    .where(and(eq(studentGuardians.membershipId, v.membershipId), eq(studentGuardians.access, 'active'), eq(students.status, 'active')))
    .orderBy(asc(students.firstName));
  return rows
    .filter((r) => r.g.canViewStudent || r.g.canSubmitAttendance)
    .map((r) => ({
      key: `manual:${r.s.id}`,
      name: studentName(r.s),
      gradeId: r.s.gradeId,
      grade: r.grade,
      canSubmitAttendance: r.g.canSubmitAttendance,
      canView: r.g.canViewStudent,
      studentId: r.s.id,
    }));
}

/** The family's SIS person id: saved link, else a single exact email match. */
async function sisPersonId(tenantId: string, v: FamilyViewer, provider: ProviderId, api: SisConnector, db: Db): Promise<string | null> {
  const known = await withTenant(
    tenantId,
    async (tx) => (await tx.select().from(sisPersonLinks).where(and(eq(sisPersonLinks.membershipId, v.membershipId), eq(sisPersonLinks.provider, provider))))[0],
    db,
  );
  if (known) return known.personId;
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, v.userId));
  if (!u?.email) return null;
  const p = await api.findParentByEmail(u.email);
  if (!p) return null;
  await withTenant(
    tenantId,
    async (tx) => {
      await tx.insert(sisPersonLinks).values({ tenantId, membershipId: v.membershipId, provider, personId: p.personId, matchedBy: 'email' }).onConflictDoNothing();
      await audit(tx, { tenantId, actorUserId: v.userId, action: 'directory.person_matched', targetType: 'membership', targetId: v.membershipId, metadata: { provider, by: 'email' } });
    },
    db,
  );
  return p.personId;
}

async function sisChildren(tenantId: string, v: FamilyViewer, provider: ProviderId, db: Db): Promise<Child[]> {
  const s = await withTenant(tenantId, (tx) => settings(tx, tenantId), db);
  let list: SisChild[];
  try {
    const api = connectorFor(tenantId, s, provider);
    if (!api) throw new DirectoryUnavailableError('The school has not finished connecting its student records yet. Please call the office.');
    const personId = await sisPersonId(tenantId, v, provider, api, db);
    if (!personId) return [];
    list = (await api.childrenOf(personId)).filter((c) => SIS_ID.test(c.studentId));
  } catch (err) {
    if (err instanceof SisError) {
      console.error('directory: SIS', provider, err.kind);
      throw new DirectoryUnavailableError();
    }
    throw err;
  }
  return withTenant(
    tenantId,
    async (tx) => {
      const match = await gradeMatcher(tx, s.gradeMap);
      const blocked = new Set((await tx.select({ k: directoryBlocks.studentKey }).from(directoryBlocks).where(eq(directoryBlocks.membershipId, v.membershipId))).map((r) => r.k));
      return list
        .map((c) => {
          const g = match(c.gradeLevel);
          return {
            key: `${provider}:${c.studentId}`,
            name: `${c.nickname || c.firstName} ${c.lastName}`,
            gradeId: g?.id ?? null,
            grade: g?.name ?? c.gradeLevel,
            canSubmitAttendance: c.canAct,
            canView: c.canAct,
            studentId: null,
          };
        })
        .filter((c) => c.canView && !blocked.has(c.key))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    db,
  );
}

/** The children this family account may act for, from the school's source. */
export async function familyChildren(tenantId: string, viewer: Viewer, db: Db = platformDb()): Promise<Child[]> {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  const source = await directorySource(tenantId, db);
  if (source === 'none') return [];
  if (source === 'manual') return withTenant(tenantId, (tx) => manualChildren(tx, v), db);
  const ck = `${tenantId}:${v.membershipId}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.children;
  const children = await sisChildren(tenantId, v, source, db);
  cache.set(ck, { at: Date.now(), children });
  return children;
}

/** The single check before acting for a child. Null when the account may not. */
export async function childFor(tenantId: string, viewer: Viewer, key: string, permission: 'submit_attendance' | 'view', db: Db = platformDb()): Promise<Child | null> {
  // A bare id is a manual-list student (older forms and links).
  const k = UUID.test(key) ? `manual:${key}` : key;
  if (!/^(manual|facts|oneroster):[A-Za-z0-9_.-]{1,100}$/.test(k)) return null;
  const c = (await familyChildren(tenantId, viewer, db)).find((x) => x.key === k);
  if (!c) return null;
  if (permission === 'submit_attendance' && !c.canSubmitAttendance) return null;
  if (permission === 'view' && !c.canView) return null;
  return c;
}

// ---------- School settings (integrations.manage) ----------

function needManage(ctx: AuthzContext) {
  assertStaff(ctx, { write: true });
  if (!can(ctx, 'integrations.manage')) deny('Not allowed: integrations.manage');
}

export async function getDirectorySettings(ctx: AuthzContext, db: Db = platformDb()) {
  assertStaff(ctx);
  if (!can(ctx, 'integrations.manage')) deny('Not allowed: integrations.manage');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const s = await settings(tx, ctx.tenantId);
      const blocks = await tx
        .select({ membershipId: directoryBlocks.membershipId, studentKey: directoryBlocks.studentKey, note: directoryBlocks.note, createdAt: directoryBlocks.createdAt, email: user.email, name: user.name })
        .from(directoryBlocks)
        .innerJoin(memberships, eq(memberships.id, directoryBlocks.membershipId))
        .innerJoin(user, eq(user.id, memberships.userId))
        .orderBy(asc(directoryBlocks.createdAt));
      const families = await tx
        .select({ id: memberships.id, name: user.name, email: user.email, personId: sisPersonLinks.personId, matchedBy: sisPersonLinks.matchedBy })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .leftJoin(sisPersonLinks, and(eq(sisPersonLinks.membershipId, memberships.id), eq(sisPersonLinks.provider, isSis(s.source) ? s.source : 'facts')))
        .where(and(eq(memberships.kind, 'family'), eq(memberships.status, 'active')))
        .orderBy(asc(user.name));
      const oc = s.onerosterConfig;
      return {
        source: s.source,
        /** The provider shown on the page: the selected SIS, or FACTS by default. */
        provider: (isSis(s.source) ? s.source : 'facts') as ProviderId,
        providers: PROVIDERS,
        hasKey: !!s.factsApiKeyEnc,
        keyHint: s.factsApiKeyHint,
        oneroster: oc ? { version: oc.version, baseUrl: oc.baseUrl, tokenUrl: oc.tokenUrl, clientId: oc.clientId, product: oc.product } : null,
        hasSecret: !!s.onerosterSecretEnc,
        secretHint: s.onerosterSecretHint,
        status: s.factsStatus,
        checkedAt: s.factsCheckedAt,
        lastError: s.factsLastError,
        gradeMap: s.gradeMap,
        families,
        blocks,
        platformReady: !!process.env.FACTS_API_BASE_URL && !!process.env.FACTS_SUBSCRIPTION_KEY,
      };
    },
    db,
  );
}

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'Enter a full address that starts with https://');

const settingsSchema = z.object({
  source: z.enum(['none', 'manual', 'facts', 'oneroster']),
  /** Empty keeps the saved key. */
  factsApiKey: z.string().trim().max(200).default(''),
  /** OneRoster: sent only when the school fills the OneRoster form. */
  oneroster: z
    .object({
      product: z.enum(['powerschool', 'infinite_campus', 'skyward', 'other']).default('other'),
      version: z.enum(['v1p1', 'v1p2']),
      baseUrl: httpsUrl,
      tokenUrl: httpsUrl,
      clientId: z.string().trim().min(1, 'Enter the client ID.').max(200),
      /** Empty keeps the saved secret. */
      clientSecret: z.string().trim().max(400).default(''),
    })
    .optional(),
});

export async function updateDirectorySettings(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  needManage(ctx);
  const d = settingsSchema.parse(input);
  if (d.factsApiKey && !/^[\x21-\x7e]{8,200}$/.test(d.factsApiKey)) throw new ValidationError('That doesn\'t look like a FACTS API key.');
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      const prev = await settings(tx, ctx.tenantId);
      if (d.source === 'facts' && !d.factsApiKey && !prev.factsApiKeyEnc) throw new ValidationError('Paste the school\'s FACTS API key first.');
      const o = d.oneroster;
      if (d.source === 'oneroster' && !o && !prev.onerosterConfig) throw new ValidationError('Fill in the OneRoster connection details first.');
      if (o && !o.clientSecret && !prev.onerosterSecretEnc) throw new ValidationError('Paste the client secret.');
      const untested = { factsStatus: 'not_configured' as const, factsCheckedAt: null, factsLastError: null };
      const orChanged = !!o && (!!o.clientSecret || JSON.stringify(prev.onerosterConfig) !== JSON.stringify({ version: o.version, baseUrl: o.baseUrl, tokenUrl: o.tokenUrl, clientId: o.clientId, product: o.product }));
      const keySet = {
        ...(d.factsApiKey ? { factsApiKeyEnc: encryptSecret(d.factsApiKey, keyContext(ctx.tenantId)), factsApiKeyHint: d.factsApiKey.slice(-4) } : {}),
        ...(o ? { onerosterConfig: { version: o.version, baseUrl: o.baseUrl, tokenUrl: o.tokenUrl, clientId: o.clientId, product: o.product } } : {}),
        ...(o?.clientSecret ? { onerosterSecretEnc: encryptSecret(o.clientSecret, secretContext(ctx.tenantId)), onerosterSecretHint: o.clientSecret.slice(-4) } : {}),
        // A new source or new credentials need a new test.
        ...(d.factsApiKey || orChanged || d.source !== prev.source ? untested : {}),
      };
      await tx
        .insert(directorySettings)
        .values({ tenantId: ctx.tenantId, source: d.source, ...keySet, updatedByUserId: ctx.userId, updatedAt: new Date() })
        .onConflictDoUpdate({ target: directorySettings.tenantId, set: { source: d.source, ...keySet, updatedByUserId: ctx.userId, updatedAt: new Date() } });
      // New credentials may belong to another SIS account: earlier person matches no longer hold.
      if (d.factsApiKey) await tx.delete(sisPersonLinks).where(eq(sisPersonLinks.provider, 'facts'));
      if (orChanged) await tx.delete(sisPersonLinks).where(eq(sisPersonLinks.provider, 'oneroster'));
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'directory.settings_updated',
        targetType: 'tenant',
        targetId: ctx.tenantId,
        metadata: { source: d.source, keyChanged: !!d.factsApiKey, onerosterChanged: orChanged },
      });
    },
    db,
  );
  clearDirectoryCache(ctx.tenantId);
}

/** Calls the selected SIS once with the saved credentials and records the result. */
export async function testConnection(ctx: AuthzContext, db: Db = platformDb()) {
  needManage(ctx);
  const s = await withTenant(ctx.tenantId, (tx) => settings(tx, ctx.tenantId), db);
  const provider: ProviderId = isSis(s.source) ? s.source : s.onerosterConfig && !s.factsApiKeyEnc ? 'oneroster' : 'facts';
  let error: string | null = null;
  let note: string | null = null;
  try {
    const api = connectorFor(ctx.tenantId, s, provider);
    if (!api) throw new ValidationError(provider === 'facts' ? 'Save the FACTS API key first.' : 'Save the OneRoster connection details first.');
    note = (await api.ping())?.note ?? null;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    error = err instanceof SisError ? err.message : 'The connection test failed.';
  }
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx
        .update(directorySettings)
        .set({ factsStatus: error ? 'error' : 'connected', factsCheckedAt: new Date(), factsLastError: error ?? note })
        .where(eq(directorySettings.tenantId, ctx.tenantId));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'directory.tested', targetType: 'tenant', targetId: ctx.tenantId, metadata: { provider, ok: !error } });
    },
    db,
  );
  return { ok: !error, error, note, provider };
}

/** Older name, kept for callers written before OneRoster. */
export async function testFactsConnection(ctx: AuthzContext, db: Db = platformDb()) {
  const r = await testConnection(ctx, db);
  return { ok: r.ok, error: r.error };
}

const blockSchema = z.object({
  membershipId: z.string().uuid('Choose a family account.'),
  /** The student's id in the SIS ("factsStudentId" from older forms). */
  studentId: z.string().trim().regex(SIS_ID, 'Enter the student\'s ID from the SIS.'),
  note: z.string().trim().min(5, 'Add a note (for example, the court order on file).').max(500),
});

async function sisProvider(tenantId: string, db: Db): Promise<ProviderId> {
  const src = await directorySource(tenantId, db);
  if (!isSis(src)) throw new ValidationError('Choose FACTS or OneRoster as the source first.');
  return src;
}

/** Stops a family account from acting for an SIS student (custody order). */
export async function addBlock(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  needManage(ctx);
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = blockSchema.parse({ ...raw, studentId: raw.studentId ?? raw.factsStudentId });
  const provider = await sisProvider(ctx.tenantId, db);
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.id, d.membershipId));
      if (!m || m.kind !== 'family') throw new ValidationError('Choose a family account.');
      const studentKey = `${provider}:${d.studentId}`;
      await tx
        .insert(directoryBlocks)
        .values({ tenantId: ctx.tenantId, membershipId: d.membershipId, studentKey, note: d.note, createdByUserId: ctx.userId })
        .onConflictDoUpdate({ target: [directoryBlocks.membershipId, directoryBlocks.studentKey], set: { note: d.note } });
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'directory.blocked', targetType: 'membership', targetId: d.membershipId, metadata: { studentKey } });
    },
    db,
  );
  clearDirectoryCache(ctx.tenantId);
}

export async function removeBlock(ctx: AuthzContext, membershipId: string, studentKey: string, db: Db = platformDb()) {
  needManage(ctx);
  if (!UUID.test(membershipId)) throw new ValidationError('Block not found.');
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      const r = await tx.delete(directoryBlocks).where(and(eq(directoryBlocks.membershipId, membershipId), eq(directoryBlocks.studentKey, studentKey))).returning();
      if (!r.length) throw new ValidationError('Block not found.');
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'directory.unblocked', targetType: 'membership', targetId: membershipId, metadata: { studentKey } });
    },
    db,
  );
  clearDirectoryCache(ctx.tenantId);
}

/** Staff fix for a parent whose SIS email differs from the portal account's. */
export async function setPersonLink(ctx: AuthzContext, membershipId: string, personId: string | null, db: Db = platformDb()) {
  needManage(ctx);
  if (!UUID.test(membershipId)) throw new ValidationError('Choose a family account.');
  if (personId !== null && !SIS_ID.test(personId)) throw new ValidationError('Enter the parent\'s ID from the SIS.');
  const provider = await sisProvider(ctx.tenantId, db);
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
      if (!m || m.kind !== 'family') throw new ValidationError('Choose a family account.');
      await tx.delete(sisPersonLinks).where(and(eq(sisPersonLinks.membershipId, membershipId), eq(sisPersonLinks.provider, provider)));
      if (personId) await tx.insert(sisPersonLinks).values({ tenantId: ctx.tenantId, membershipId, provider, personId, matchedBy: 'staff' });
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'directory.person_linked', targetType: 'membership', targetId: membershipId, metadata: { provider, cleared: !personId } });
    },
    db,
  );
  clearDirectoryCache(ctx.tenantId);
}
