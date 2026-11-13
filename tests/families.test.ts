// Family accounts: join code, requests, approval, and what each viewer sees.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { familyRequests, audiences, grades, memberships, membershipRoles, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import {
  approveFamilyRequest,
  checkJoinCode,
  listFamilies,
  listFamilyRequests,
  myFamilyStatus,
  rejectFamilyRequest,
  requestToJoin,
  setFamilyGrades,
  setJoinCode,
} from '@/server/services/families';
import { createAnnouncement, listPublicAnnouncements, getPublicAnnouncement, transitionAnnouncement } from '@/server/services/content';
import { createDocument, listPublicDocuments, resolveDocumentLink, transitionDocument } from '@/server/services/documents';
import { setMemberSuspended } from '@/server/services/staff';
import { MemoryStorage } from '@/server/storage/storage';
import { assertViewer, loadViewer, PUBLIC_VIEWER, type Viewer } from '@/server/viewer';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;
const ids: Record<string, string> = {};

const gradeId = (tenantId: string, code: string) =>
  withTenant(tenantId, async (tx) => (await tx.select().from(grades).where(eq(grades.code, code)))[0]!.id);
const audId = (tenantId: string, key: string) =>
  withTenant(tenantId, async (tx) => (await tx.select().from(audiences).where(eq(audiences.key, key)))[0]!.id);

async function approvedFamily(s: typeof a, code: string, gradeCodes: string[]) {
  const userId = await createUser('Parent');
  const g = await Promise.all(gradeCodes.map((c) => gradeId(s.tenant.id, c)));
  const r = await requestToJoin(s.tenant.id, userId, { code, gradeIds: g, note: 'Ana, grade 3' });
  const m = await approveFamilyRequest(s.ownerCtx, r.id);
  return { userId, membershipId: m.id, viewer: await loadViewer(s.tenant.id, userId) };
}

let codeA = '';

beforeAll(async () => {
  a = await createSchool('fam-a');
  b = await createSchool('fam-b');
  codeA = (await setJoinCode(a.ownerCtx, true))!;
  ids.g3 = await gradeId(a.tenant.id, '3');
  ids.g5 = await gradeId(a.tenant.id, '5');
  ids.aud3 = await audId(a.tenant.id, 'grade-3');
  ids.aud5 = await audId(a.tenant.id, 'grade-5');
  ids.audStaff = await audId(a.tenant.id, 'staff');
});
afterAll(async () => {
  await closeDb();
});

describe('joining', () => {
  it('needs the right code, grades and a note; nothing is visible until approved', async () => {
    expect(codeA).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(await checkJoinCode(a.tenant.id, codeA.toLowerCase())).toBe(true);
    expect(await checkJoinCode(a.tenant.id, 'WRONG123')).toBe(false);
    expect(await checkJoinCode(b.tenant.id, codeA)).toBe(false); // B has joining closed

    const u = await createUser('Parent');
    await expect(requestToJoin(a.tenant.id, u, { code: 'WRONG123', gradeIds: [ids.g3!], note: 'x' })).rejects.toThrow(/school code/);
    await expect(requestToJoin(a.tenant.id, u, { code: codeA, gradeIds: [], note: 'x' })).rejects.toThrow(/at least one grade/);
    await expect(requestToJoin(a.tenant.id, u, { code: codeA, gradeIds: [ids.g3!], note: '' })).rejects.toThrow(/children/);
    // A grade from another school is refused.
    await expect(requestToJoin(a.tenant.id, u, { code: codeA, gradeIds: [await gradeId(b.tenant.id, '3')], note: 'x' })).rejects.toThrow(/from the list/);

    const r = await requestToJoin(a.tenant.id, u, { code: codeA, gradeIds: [ids.g3!], note: 'Ana, grade 3' });
    await expect(requestToJoin(a.tenant.id, u, { code: codeA, gradeIds: [ids.g3!], note: 'again' })).rejects.toThrow(/already asked/);
    expect(await myFamilyStatus(a.tenant.id, u)).toEqual({ state: 'pending' });
    expect((await loadViewer(a.tenant.id, u)).kind).toBe('public');
    expect((await listFamilyRequests(a.ownerCtx)).map((x) => x.id)).toContain(r.id);
    // Another school can't see or approve it.
    expect((await listFamilyRequests(b.ownerCtx)).map((x) => x.id)).not.toContain(r.id);
    await expect(approveFamilyRequest(b.ownerCtx, r.id)).rejects.toThrow(/not found/);

    await approveFamilyRequest(a.ownerCtx, r.id, [ids.g3!, ids.g5!]);
    expect(await myFamilyStatus(a.tenant.id, u)).toEqual({ state: 'family' });
    const v = await loadViewer(a.tenant.id, u);
    expect(v.kind).toBe('family');
    if (v.kind === 'family') {
      expect(v.audienceIds).toEqual(expect.arrayContaining([ids.aud3, ids.aud5]));
      expect(v.audienceIds).not.toContain(ids.audStaff);
    }
    await expect(approveFamilyRequest(a.ownerCtx, r.id)).rejects.toThrow(/already handled/);
    // A family has no admin access.
    const ctx = (await loadAuthzContext(a.tenant.id, u))!;
    expect(ctx.grants).toHaveLength(0);
  });

  it('rotating or closing the code stops old codes; rejected requests stay out', async () => {
    const old = (await setJoinCode(a.ownerCtx, true))!;
    const fresh = (await setJoinCode(a.ownerCtx, true))!;
    const u = await createUser('Parent');
    await expect(requestToJoin(a.tenant.id, u, { code: old, gradeIds: [ids.g3!], note: 'x' })).rejects.toThrow(/school code/);
    const r = await requestToJoin(a.tenant.id, u, { code: fresh, gradeIds: [ids.g3!], note: 'x' });
    await rejectFamilyRequest(a.ownerCtx, r.id);
    expect(await myFamilyStatus(a.tenant.id, u)).toEqual({ state: 'rejected' });
    expect((await loadViewer(a.tenant.id, u)).kind).toBe('public');
    await setJoinCode(a.ownerCtx, false);
    await expect(requestToJoin(a.tenant.id, await createUser('P'), { code: fresh, gradeIds: [ids.g3!], note: 'x' })).rejects.toThrow(/not accepting/);
    codeA = (await setJoinCode(a.ownerCtx, true))!;
  });

  it('only people with users.invite manage codes and requests', async () => {
    const userId = await createUser('Teacher');
    await withTenant(a.tenant.id, async (tx) => {
      const [m] = await tx.insert(memberships).values({ tenantId: a.tenant.id, userId, kind: 'staff', status: 'active' }).returning();
      const [r] = await tx.select().from(roles).where(eq(roles.key, 'teacher'));
      await tx.insert(membershipRoles).values({ tenantId: a.tenant.id, membershipId: m!.id, roleId: r!.id, scopeType: 'school', scopeId: null });
    });
    const t = (await loadAuthzContext(a.tenant.id, userId))!;
    await expect(setJoinCode(t, true)).rejects.toThrow(/users.invite/);
    await expect(listFamilyRequests(t)).rejects.toThrow(/users.view/);
  });
});

describe('what each viewer sees', () => {
  it('public, family-wide, own-grade, other-grade and staff-only content', async () => {
    const fam3 = await approvedFamily(a, codeA, ['3']);
    const staff = await loadViewer(a.tenant.id, a.ownerId);
    expect(staff.kind).toBe('staff');
    const mk = async (title: string, extra: Record<string, unknown>) => {
      const x = await createAnnouncement(a.ownerCtx, { title, ...extra });
      await transitionAnnouncement(a.ownerCtx, x.id, 'publish');
      return x.id;
    };
    const pub = await mk('Public news', {});
    const pubG5 = await mk('Public, tagged grade 5', { audienceIds: [ids.aud5] });
    const famAll = await mk('All families', { visibility: 'families' });
    const fam3Only = await mk('Grade 3 families', { visibility: 'families', audienceIds: [ids.aud3] });
    const fam5Only = await mk('Grade 5 families', { visibility: 'families', audienceIds: [ids.aud5] });
    const staffOnly = await mk('Staff only', { visibility: 'staff' });

    const titles = async (v: Viewer) => (await listPublicAnnouncements(a.tenant.id, v, { limit: 200 })).map((x) => x.id);
    const anon = await titles(PUBLIC_VIEWER);
    expect(anon).toEqual(expect.arrayContaining([pub, pubG5]));
    expect(anon).not.toEqual(expect.arrayContaining([famAll]));
    for (const id of [famAll, fam3Only, fam5Only, staffOnly]) expect(anon).not.toContain(id);

    const f = await titles(fam3.viewer);
    expect(f).toEqual(expect.arrayContaining([pub, pubG5, famAll, fam3Only]));
    expect(f).not.toContain(fam5Only);
    expect(f).not.toContain(staffOnly);

    const s = await titles(staff);
    expect(s).toEqual(expect.arrayContaining([pub, famAll, fam3Only, fam5Only, staffOnly]));

    // Direct links follow the same rule.
    expect(await getPublicAnnouncement(a.tenant.id, fam3Only, PUBLIC_VIEWER)).toBeNull();
    expect(await getPublicAnnouncement(a.tenant.id, fam3Only, fam3.viewer)).not.toBeNull();
    expect(await getPublicAnnouncement(a.tenant.id, fam5Only, fam3.viewer)).toBeNull();

    // Changing grades changes what they see; suspension makes them public.
    await setFamilyGrades(a.ownerCtx, fam3.membershipId, [ids.g5!]);
    const moved = await loadViewer(a.tenant.id, fam3.userId);
    expect(await getPublicAnnouncement(a.tenant.id, fam5Only, moved)).not.toBeNull();
    expect(await getPublicAnnouncement(a.tenant.id, fam3Only, moved)).toBeNull();
    await setMemberSuspended(a.ownerCtx, fam3.membershipId, true);
    expect((await loadViewer(a.tenant.id, fam3.userId)).kind).toBe('public');
  });

  it('documents: family-only files open for the right families only', async () => {
    const storage = new MemoryStorage();
    const fam3 = await approvedFamily(a, codeA, ['3']);
    const fam5 = await approvedFamily(a, codeA, ['5']);
    const pdf = new TextEncoder().encode('%PDF-1.7\nx\n%%EOF');
    const d = await createDocument(a.ownerCtx, { title: 'G3 list', slug: 'g3-list', audienceIds: [ids.aud3], visibility: 'families' }, { name: 'l.pdf', bytes: pdf }, { storage });
    await transitionDocument(a.ownerCtx, d.id, 'publish');
    const open = (v: Viewer) => resolveDocumentLink(a.tenant.id, 'g3-list', null, { moduleActive: true, viewer: v });
    expect(await open(PUBLIC_VIEWER)).toBeNull();
    expect(await open(fam5.viewer)).toBeNull();
    expect(await open(fam3.viewer)).not.toBeNull();
    expect((await listPublicDocuments(a.tenant.id, fam3.viewer)).map((x) => x.slug)).toContain('g3-list');
    expect((await listPublicDocuments(a.tenant.id, PUBLIC_VIEWER)).map((x) => x.slug)).not.toContain('g3-list');
  });

  it('viewers cannot be forged or used in another school', async () => {
    const fam = await approvedFamily(a, codeA, ['3']);
    expect(() => assertViewer({ ...fam.viewer }, a.tenant.id)).toThrow(/Unverified/);
    await expect(listPublicAnnouncements(b.tenant.id, fam.viewer)).rejects.toThrow(/another school/);
    // A family of school A is just a visitor in school B.
    expect((await loadViewer(b.tenant.id, fam.userId)).kind).toBe('public');
    expect((await listFamilies(a.ownerCtx)).some((x) => x.userId === fam.userId)).toBe(true);
    expect((await listFamilies(b.ownerCtx)).some((x) => x.userId === fam.userId)).toBe(false);
  });
});
