// Private object storage. Production uses Cloudflare R2 (S3 API, signed with
// aws4fetch). Development without R2 credentials uses a folder on disk, and
// tests use memory. Callers only ever get short-lived signed download URLs.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

export type SignedUrlOptions = { fileName: string; contentType: string; expiresIn?: number; inline?: boolean };

export interface ObjectStorage {
  readonly kind: 'r2' | 'local' | 'memory';
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  signedGetUrl(key: string, opts: SignedUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('File storage is not configured. Add the R2_* variables (see .env.example).');
    this.name = 'StorageNotConfiguredError';
  }
}

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 name. */
export function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const DEFAULT_EXPIRY = 300;

export class R2Storage implements ObjectStorage {
  readonly kind = 'r2' as const;
  private client: AwsClient;
  private base: string;
  constructor(cfg: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
    this.base = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
  }
  private url(key: string) {
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  async put(key: string, body: Uint8Array, contentType: string) {
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body: body as unknown as BodyInit,
      headers: { 'content-type': contentType, 'content-length': String(body.byteLength) },
    });
    if (!res.ok) throw new Error(`Upload to storage failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  async signedGetUrl(key: string, opts: SignedUrlOptions) {
    const u = new URL(this.url(key));
    u.searchParams.set('X-Amz-Expires', String(opts.expiresIn ?? DEFAULT_EXPIRY));
    u.searchParams.set('response-content-disposition', contentDisposition(opts.fileName, opts.inline ?? true));
    u.searchParams.set('response-content-type', opts.contentType);
    const signed = await this.client.sign(u.toString(), { method: 'GET', aws: { signQuery: true } });
    return signed.url;
  }
  async delete(key: string) {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`Delete from storage failed (${res.status})`);
  }
}

/** Development only: files on disk, served by /api/dev-storage with an HMAC-signed link. */
export class LocalStorage implements ObjectStorage {
  readonly kind = 'local' as const;
  constructor(
    private root: string,
    private secret: string,
  ) {}
  private file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return p;
  }
  async put(key: string, body: Uint8Array) {
    const p = this.file(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  sign(key: string, exp: number, name: string, type: string, inline: boolean) {
    return createHmac('sha256', this.secret).update([key, exp, name, type, inline ? 1 : 0].join('\n')).digest('base64url');
  }
  async signedGetUrl(key: string, opts: SignedUrlOptions) {
    const exp = Math.floor(Date.now() / 1000) + (opts.expiresIn ?? DEFAULT_EXPIRY);
    const inline = opts.inline ?? true;
    const q = new URLSearchParams({
      key,
      exp: String(exp),
      name: opts.fileName,
      type: opts.contentType,
      inline: inline ? '1' : '0',
      sig: this.sign(key, exp, opts.fileName, opts.contentType, inline),
    });
    return `/api/dev-storage?${q}`;
  }
  verify(q: URLSearchParams): { key: string; name: string; type: string; inline: boolean } | null {
    const key = q.get('key') ?? '';
    const exp = Number(q.get('exp'));
    const name = q.get('name') ?? '';
    const type = q.get('type') ?? '';
    const inline = q.get('inline') === '1';
    if (!key || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
    const want = Buffer.from(this.sign(key, exp, name, type, inline));
    const got = Buffer.from(q.get('sig') ?? '');
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return { key, name, type, inline };
  }
  read(key: string) {
    return readFile(this.file(key));
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

export class MemoryStorage implements ObjectStorage {
  readonly kind = 'memory' as const;
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async signedGetUrl(key: string, opts: SignedUrlOptions) {
    if (!this.objects.has(key)) throw new Error('No such object');
    return `memory://${key}?name=${encodeURIComponent(opts.fileName)}&exp=${opts.expiresIn ?? DEFAULT_EXPIRY}`;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

let override: ObjectStorage | null = null;
let cached: ObjectStorage | null | undefined;

/** Tests swap in MemoryStorage. */
export function setStorageForTests(s: ObjectStorage | null) {
  override = s;
}

export function getPrivateStorage(): ObjectStorage {
  if (override) return override;
  if (cached === undefined) {
    const e = process.env;
    if (e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_PRIVATE_BUCKET) {
      cached = new R2Storage({
        accountId: e.R2_ACCOUNT_ID.trim(),
        accessKeyId: e.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: e.R2_SECRET_ACCESS_KEY.trim(),
        bucket: e.R2_PRIVATE_BUCKET.trim(),
      });
    } else if (e.NODE_ENV !== 'production' && e.BETTER_AUTH_SECRET) {
      cached = new LocalStorage(path.resolve('.storage'), e.BETTER_AUTH_SECRET);
    } else {
      cached = null;
    }
  }
  if (!cached) throw new StorageNotConfiguredError();
  return cached;
}
