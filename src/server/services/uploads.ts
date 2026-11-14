// Direct uploads: files too big for a server request (Vercel accepts about
// 4.5 MB) go from the browser straight to private storage.
//
// 1. The server checks permission and hands out a ticket: a fresh storage key
//    under the school's prefix, a short-lived signed PUT URL, and a token that
//    binds that key to this school and this person.
// 2. The browser PUTs the file to the URL.
// 3. The form sends the token instead of the file. The server verifies it,
//    reads the object back, checks its type and size like any other upload,
//    and only then records it. A file that fails the checks is deleted.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, hasAnywhere, type AuthzContext } from '../rbac/authorize';
import { storageSafeName } from '../storage/files';
import { getPrivateStorage, type ObjectStorage } from '../storage/storage';
import { ValidationError } from '../errors';

/**
 * Files above this size go through a direct upload. It sits under the 4 MB
 * server-action limit (next.config.ts) so the form fields always fit too.
 */
export const DIRECT_UPLOAD_ABOVE_BYTES = 3 * 1024 * 1024;

/** Largest file accepted through a direct upload. */
export const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;
const TICKET_SECONDS = 15 * 60;

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error('BETTER_AUTH_SECRET is not set.');
  return s;
}

function sign(tenantId: string, userId: string, key: string, exp: number) {
  return createHmac('sha256', secret()).update(['upload', tenantId, userId, key, exp].join('\n')).digest('base64url');
}

export type UploadTicket = { token: string; putUrl: string };

export async function createUploadTicket(
  ctx: AuthzContext,
  input: { fileName: string; sizeBytes: number },
  storage: ObjectStorage = getPrivateStorage(),
): Promise<UploadTicket> {
  assertVerifiedContext(ctx);
  if (ctx.support) throw new AuthorizationError('Support sessions are read-only.');
  if (!hasAnywhere(ctx, 'documents.upload')) throw new AuthorizationError('Not allowed: documents.upload', 'documents.upload');
  const size = Number(input.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) throw new ValidationError('Choose a file to upload.');
  if (size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new ValidationError(`The file is ${(size / 1048576).toFixed(1)} MB. The limit is ${MAX_DIRECT_UPLOAD_BYTES / 1048576} MB.`);
  }
  const name = String(input.fileName ?? '').slice(0, 200) || 'file';
  const key = `t/${ctx.tenantId}/incoming/${randomUUID()}/${storageSafeName(name)}`;
  const exp = Math.floor(Date.now() / 1000) + TICKET_SECONDS;
  const putUrl = await storage.signedPutUrl(key, TICKET_SECONDS);
  const token = `${Buffer.from(JSON.stringify({ k: key, e: exp })).toString('base64url')}.${sign(ctx.tenantId, ctx.userId, key, exp)}`;
  return { token, putUrl };
}

/** The storage key a token stands for, if it was issued to this person in this school and has not expired. */
export function verifyUploadToken(ctx: AuthzContext, token: string): string {
  const [body, sig] = String(token ?? '').split('.');
  let parsed: { k?: unknown; e?: unknown } = {};
  try {
    parsed = JSON.parse(Buffer.from(body ?? '', 'base64url').toString('utf8'));
  } catch {
    parsed = {};
  }
  const key = typeof parsed.k === 'string' ? parsed.k : '';
  const exp = typeof parsed.e === 'number' ? parsed.e : 0;
  const bad = new ValidationError('The upload expired or is not valid. Choose the file again.');
  if (!key || !exp || !sig) throw bad;
  if (!key.startsWith(`t/${ctx.tenantId}/incoming/`)) throw bad;
  const want = Buffer.from(sign(ctx.tenantId, ctx.userId, key, exp));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw bad;
  // The file is read back right after upload; allow a little extra time for slow connections.
  if (exp + TICKET_SECONDS < Date.now() / 1000) throw bad;
  return key;
}
