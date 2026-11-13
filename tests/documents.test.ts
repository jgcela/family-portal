// Documents: upload checks, versions, stable-link access, quotas and isolation.
import { PUBLIC_VIEWER } from '@/server/viewer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { audiences, documentVersions, membershipRoles, memberships, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import {
  createDocument,
  deleteDocument,
  getDocumentForStaff,
  listDocumentsForStaff,
  resolveDocumentLink,
  setCurrentDocumentVersion,
  transitionDocument,
  updateDocument,
  uploadDocumentVersion,
} from '@/server/services/documents';
import { detectFileKind, sanitizeFileName } from '@/server/storage/files';
import { contentDisposition, MemoryStorage } from '@/server/storage/storage';
import { createSchool, createUser, expectDbError } from './helpers';

const storage = new MemoryStorage();
const opts = { storage };
let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

const pdf = (text = 'hello') => new TextEncoder().encode(`%PDF-1.7\n${text}\n%%EOF`);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
const meta = (slug: string, extra: Record<string, unknown> = {}) => ({ title: `Doc ${slug}`, slug, ...extra });

async function addMember(tenantId: string, roleKey: string) {
  const userId = await createUser(`member-${roleKey}`);
  await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
    await tx.insert(membershipRoles).values({ tenantId, membershipId: m!.id, roleId: r!.id, scopeType: 'school', scopeId: null });
  });
  return (await loadAuthzContext(tenantId, userId))!;
}

const link = (tenantId: string, slug: string, viewer: Parameters<typeof resolveDocumentLink>[2], o: { version?: number } = {}) =>
  resolveDocumentLink(tenantId, slug, viewer, { moduleActive: true, viewer: PUBLIC_VIEWER, ...o });

beforeAll(async () => {
  a = await createSchool('docs-a');
  b = await createSchool('docs-b');
});
afterAll(async () => {
  await closeDb();
});

describe('file checks', () => {
  it('detects real types from content and refuses mismatches and dangerous files', () => {
    expect(detectFileKind('form.pdf', pdf()).ok).toBe(true);
    expect(detectFileKind('photo.PNG', png).ok).toBe(true);
    expect(detectFileKind('handbook.docx', zip).ok).toBe(true);
    // A PDF renamed to .png, an HTML page called .txt, a script, a zip called .zip, an executable.
    expect(detectFileKind('x.png', pdf()).ok).toBe(false);
    expect(detectFileKind('x.txt', new TextEncoder().encode('<!doctype html><script>1</script>')).ok).toBe(false);
    expect(detectFileKind('x.html', new TextEncoder().encode('<p>hi</p>')).ok).toBe(false);
    expect(detectFileKind('x.svg', new TextEncoder().encode('<svg onload="x"/>')).ok).toBe(false);
    expect(detectFileKind('x.zip', zip).ok).toBe(false);
    expect(detectFileKind('x.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0])).ok).toBe(false);
    expect(detectFileKind('x.csv', new Uint8Array([0x61, 0, 0x62])).ok).toBe(false);
    expect(detectFileKind('menu.csv', new TextEncoder().encode('día,comida\nlunes,sopa')).ok).toBe(true);
    expect(detectFileKind('empty.pdf', new Uint8Array()).ok).toBe(false);
  });

  it('cleans file names and builds safe Content-Disposition headers', () => {
    const k = detectFileKind('a.pdf', pdf());
    if (!k.ok) throw new Error('expected pdf');
    expect(sanitizeFileName('../../etc/Menú "otoño"\u0000.pdf', k.kind)).toBe('etc/Menú otoño.pdf'.split('/').pop());
    expect(sanitizeFileName('.pdf', k.kind)).toBe('document.pdf');
    const cd = contentDisposition('Menú "x".pdf', true);
    expect(cd).toMatch(/^inline; filename="Men_ _x_.pdf"; filename\*=UTF-8''Men%C3%BA%20%22x%22.pdf$/);
  });
});

describe('documents', () => {
  it('uploads, publishes and serves the current version through the stable link', async () => {
    const doc = await createDocument(a.ownerCtx, meta('lunch-menu', { category: 'Menus' }), { name: 'Lunch Menu.pdf', bytes: pdf('v1') }, opts);
    expect(doc.status).toBe('draft');
    // Drafts are invisible to the public, visible to staff.
    expect(await link(a.tenant.id, 'lunch-menu', null)).toBeNull();
    expect((await link(a.tenant.id, 'lunch-menu', a.ownerCtx))?.version).toBe(1);

    await transitionDocument(a.ownerCtx, doc.id, 'publish');
    const v1 = await link(a.tenant.id, 'lunch-menu', null);
    expect(v1).toMatchObject({ version: 1, fileName: 'Lunch Menu.pdf', contentType: 'application/pdf' });
    expect(storage.objects.has(v1!.storageKey)).toBe(true);
    expect(v1!.storageKey.startsWith(`t/${a.tenant.id}/documents/${doc.id}/`)).toBe(true);

    // A new version keeps the same link.
    await uploadDocumentVersion(a.ownerCtx, doc.id, { name: 'menu-december.pdf', bytes: pdf('v2') }, opts);
    const v2 = await link(a.tenant.id, 'lunch-menu', null);
    expect(v2).toMatchObject({ version: 2, fileName: 'menu-december.pdf' });

    // Older versions: staff only.
    expect(await link(a.tenant.id, 'lunch-menu', null, { version: 1 })).toBeNull();
    expect((await link(a.tenant.id, 'lunch-menu', a.ownerCtx, { version: 1 }))?.fileName).toBe('Lunch Menu.pdf');

    // Restore v1 as the current file.
    const { versions } = await getDocumentForStaff(a.ownerCtx, doc.id);
    await setCurrentDocumentVersion(a.ownerCtx, doc.id, versions.find((v) => v.version === 1)!.id);
    expect((await link(a.tenant.id, 'lunch-menu', null))?.version).toBe(1);

    // Module off: public link stops working, staff still can open it.
    expect(await resolveDocumentLink(a.tenant.id, 'lunch-menu', null, { moduleActive: false, viewer: PUBLIC_VIEWER })).toBeNull();
    expect(await resolveDocumentLink(a.tenant.id, 'lunch-menu', a.ownerCtx, { moduleActive: false, viewer: PUBLIC_VIEWER })).not.toBeNull();
  });

  it('keeps audience-limited documents away from the public', async () => {
    const [aud] = await withTenant(a.tenant.id, (tx) => tx.select().from(audiences).where(eq(audiences.key, 'grade-5')));
    const doc = await createDocument(a.ownerCtx, meta('grade5-list', { audienceIds: [aud!.id], visibility: 'families' }), { name: 'list.pdf', bytes: pdf() }, opts);
    await transitionDocument(a.ownerCtx, doc.id, 'publish');
    expect(await link(a.tenant.id, 'grade5-list', null)).toBeNull();
    expect(await link(a.tenant.id, 'grade5-list', a.ownerCtx)).not.toBeNull();
  });

  it('refuses bad files, duplicate links and over-quota uploads without leaving files behind', async () => {
    const before = storage.objects.size;
    await expect(createDocument(a.ownerCtx, meta('bad'), { name: 'x.pdf', bytes: png }, opts)).rejects.toThrow(/PNG/);
    await expect(createDocument(a.ownerCtx, meta('lunch-menu'), { name: 'x.pdf', bytes: pdf() }, opts)).rejects.toThrow(/already uses/);
    await expect(createDocument(a.ownerCtx, meta('Bad Slug!'), { name: 'x.pdf', bytes: pdf() }, opts)).rejects.toThrow(/Link name/);
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(pdf());
    await expect(createDocument(a.ownerCtx, meta('big'), { name: 'big.pdf', bytes: big }, opts)).rejects.toThrow(/limit/);

    // Plan "test-basic" has 100 MB; fake heavy usage to hit the limit.
    const small = await createSchool('docs-quota', { planId: 'test-basic' });
    const d = await createDocument(small.ownerCtx, meta('q'), { name: 'q.pdf', bytes: pdf() }, opts);
    await platformDb().update(documentVersions).set({ sizeBytes: 100 * 1024 * 1024 }).where(eq(documentVersions.documentId, d.id));
    const mid = storage.objects.size;
    await expect(uploadDocumentVersion(small.ownerCtx, d.id, { name: 'q2.pdf', bytes: pdf() }, opts)).rejects.toThrow(/storage left/);
    expect(storage.objects.size).toBe(mid);
    expect(mid).toBe(before + 1);
  });

  it('isolates schools: no cross-school links, reads or edits', async () => {
    const doc = await createDocument(b.ownerCtx, meta('b-only'), { name: 'b.pdf', bytes: pdf() }, opts);
    await transitionDocument(b.ownerCtx, doc.id, 'publish');
    expect(await link(a.tenant.id, 'b-only', null)).toBeNull();
    expect(await link(a.tenant.id, 'b-only', b.ownerCtx)).toBeNull();
    await expect(getDocumentForStaff(a.ownerCtx, doc.id)).rejects.toThrow(/not found/);
    await expect(uploadDocumentVersion(a.ownerCtx, doc.id, { name: 'x.pdf', bytes: pdf() }, opts)).rejects.toThrow(/not found/);
    const listA = await listDocumentsForStaff(a.ownerCtx);
    expect(listA.items.some((r) => r.doc.id === doc.id)).toBe(false);
    // The database itself refuses a version pointing at another school's document.
    await expectDbError(
      withTenant(a.tenant.id, (tx) =>
        tx.insert(documentVersions).values({
          tenantId: a.tenant.id,
          documentId: doc.id,
          version: 9,
          storageKey: 'x',
          fileName: 'x.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1,
          sha256: 'x',
        }),
      ),
      /foreign key|violates/,
    );
    // Versions cannot be edited after upload.
    await expectDbError(
      withTenant(b.tenant.id, (tx) => tx.update(documentVersions).set({ fileName: 'evil.pdf' }).where(eq(documentVersions.documentId, doc.id))),
      /permission denied/,
    );
  });

  it('enforces roles: editors cannot publish or change live documents; volunteer coordinators cannot upload', async () => {
    const coordinator = await addMember(a.tenant.id, 'volunteer_coordinator');
    await expect(createDocument(coordinator, meta('t-doc'), { name: 't.pdf', bytes: pdf() }, opts)).rejects.toThrow(/Not allowed/);
    const editor = await addMember(a.tenant.id, 'content_editor');
    const d = await createDocument(editor, meta('editor-doc'), { name: 'e.pdf', bytes: pdf() }, opts);
    await expect(transitionDocument(editor, d.id, 'publish')).rejects.toThrow(/Not allowed/);
    await transitionDocument(a.ownerCtx, d.id, 'publish');
    await expect(uploadDocumentVersion(editor, d.id, { name: 'e2.pdf', bytes: pdf() }, opts)).rejects.toThrow(/Not allowed/);
    await expect(updateDocument(editor, d.id, meta('editor-doc', { title: 'Changed' }))).rejects.toThrow(/Not allowed/);
    await expect(deleteDocument(editor, d.id, opts)).rejects.toThrow(/Not allowed/);
  });

  it('deleting removes rows and stored files', async () => {
    const d = await createDocument(a.ownerCtx, meta('to-delete'), { name: 'd.pdf', bytes: pdf() }, opts);
    await uploadDocumentVersion(a.ownerCtx, d.id, { name: 'd2.pdf', bytes: pdf('2') }, opts);
    const { versions } = await getDocumentForStaff(a.ownerCtx, d.id);
    const keys = versions.map((v) => v.storageKey);
    expect(keys.every((k) => storage.objects.has(k))).toBe(true);
    expect((await deleteDocument(a.ownerCtx, d.id, opts)).deletedFiles).toBe(2);
    expect(keys.some((k) => storage.objects.has(k))).toBe(false);
    expect(await link(a.tenant.id, 'to-delete', a.ownerCtx)).toBeNull();
  });
});
