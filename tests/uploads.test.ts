// Direct uploads: big files go from the browser to storage, then the server
// checks them like any other file before recording them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { documentVersions, membershipRoles, memberships, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { createDocument, uploadDocumentVersion } from '@/server/services/documents';
import { createUploadTicket, MAX_DIRECT_UPLOAD_BYTES, verifyUploadToken } from '@/server/services/uploads';
import { MemoryStorage } from '@/server/storage/storage';
import { createSchool, createUser } from './helpers';

process.env.BETTER_AUTH_SECRET ??= 'test-secret-for-upload-tokens-0123456789';
const storage = new MemoryStorage();
const opts = { storage };
let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

/** A PDF just over the 4 MB server-request limit. */
const bigPdf = () => {
  const b = new Uint8Array(5 * 1024 * 1024).fill(0x20);
  b.set(new TextEncoder().encode('%PDF-1.7\n'));
  return b;
};
// MemoryStorage URLs are memory://<key>?put=1
const memKey = (putUrl: string) => putUrl.replace(/^memory:\/\//, '').replace(/\?put=1$/, '');

beforeAll(async () => {
  a = await createSchool('upl-a');
  b = await createSchool('upl-b');
});
afterAll(async () => {
  await closeDb();
});

describe('direct uploads', () => {
  it('records a big file after reading it back, once', async () => {
    const t = await createUploadTicket(a.ownerCtx, { fileName: 'Preschool Dictionary.pdf', sizeBytes: 5 * 1024 * 1024 }, storage);
    const key = memKey(t.putUrl);
    expect(key.startsWith(`t/${a.tenant.id}/incoming/`)).toBe(true);
    expect(verifyUploadToken(a.ownerCtx, t.token)).toBe(key);
    await storage.put(key, bigPdf(), 'application/pdf');

    const doc = await createDocument(a.ownerCtx, { title: 'Preschool Dictionary', slug: 'preschool-dictionary' }, { name: 'Preschool Dictionary.pdf', token: t.token }, opts);
    const [v] = await withTenant(a.tenant.id, (tx) => tx.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id)));
    expect(v).toMatchObject({ storageKey: key, sizeBytes: 5 * 1024 * 1024, contentType: 'application/pdf', fileName: 'Preschool Dictionary.pdf' });

    // The same token cannot create a second version pointing at the same object.
    await expect(uploadDocumentVersion(a.ownerCtx, doc.id, { name: 'again.pdf', token: t.token }, opts)).rejects.toThrow(/already used/);
    expect(storage.objects.has(key)).toBe(true);
  });

  it('refuses tokens from another school or person, tampered tokens and missing files', async () => {
    const t = await createUploadTicket(a.ownerCtx, { fileName: 'x.pdf', sizeBytes: 10 }, storage);
    expect(() => verifyUploadToken(b.ownerCtx, t.token)).toThrow(/not valid/);
    const [body, sig] = t.token.split('.');
    const forged = Buffer.from(JSON.stringify({ k: `t/${a.tenant.id}/documents/x/y.pdf`, e: 9e9 })).toString('base64url');
    expect(() => verifyUploadToken(a.ownerCtx, `${forged}.${sig}`)).toThrow(/not valid/);
    expect(() => verifyUploadToken(a.ownerCtx, `${body}.AAAA`)).toThrow(/not valid/);
    // Ticket issued but nothing uploaded.
    await expect(createDocument(a.ownerCtx, { title: 'Missing', slug: 'missing' }, { name: 'x.pdf', token: t.token }, opts)).rejects.toThrow(/did not reach storage/);
  });

  it('checks size and type of what arrived, and deletes a bad file', async () => {
    await expect(createUploadTicket(a.ownerCtx, { fileName: 'huge.pdf', sizeBytes: MAX_DIRECT_UPLOAD_BYTES + 1 }, storage)).rejects.toThrow(/limit/);

    // Announced as small, but a 26 MB object arrived.
    const t1 = await createUploadTicket(a.ownerCtx, { fileName: 'lie.pdf', sizeBytes: 10 }, storage);
    const k1 = memKey(t1.putUrl);
    const huge = new Uint8Array(MAX_DIRECT_UPLOAD_BYTES + 1);
    huge.set(new TextEncoder().encode('%PDF-1.7\n'));
    await storage.put(k1, huge, 'application/pdf');
    await expect(createDocument(a.ownerCtx, { title: 'Lie', slug: 'lie' }, { name: 'lie.pdf', token: t1.token }, opts)).rejects.toThrow(/limit/);
    expect(storage.objects.has(k1)).toBe(false);

    // A program renamed to .pdf.
    const t2 = await createUploadTicket(a.ownerCtx, { fileName: 'evil.pdf', sizeBytes: 10 }, storage);
    const k2 = memKey(t2.putUrl);
    await storage.put(k2, new Uint8Array([0x4d, 0x5a, 0x90, 0, 1, 2, 3, 4]), 'application/pdf');
    await expect(createDocument(a.ownerCtx, { title: 'Evil', slug: 'evil' }, { name: 'evil.pdf', token: t2.token }, opts)).rejects.toThrow();
    expect(storage.objects.has(k2)).toBe(false);
  });

  it('only people who may upload documents get a ticket', async () => {
    const userId = await createUser('Reviewer');
    await withTenant(a.tenant.id, async (tx) => {
      const [m] = await tx.insert(memberships).values({ tenantId: a.tenant.id, userId, kind: 'staff', status: 'active' }).returning();
      const [r] = await tx.select().from(roles).where(eq(roles.key, 'reviewer'));
      await tx.insert(membershipRoles).values({ tenantId: a.tenant.id, membershipId: m!.id, roleId: r!.id, scopeType: 'school' });
    });
    const reviewer = (await loadAuthzContext(a.tenant.id, userId))!;
    await expect(createUploadTicket(reviewer, { fileName: 'x.pdf', sizeBytes: 10 }, storage)).rejects.toThrow(/documents.upload/);
  });
});
