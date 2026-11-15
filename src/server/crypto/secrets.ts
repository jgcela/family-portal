// Encryption for secrets a school gives us (for example its FACTS API key).
//
// AES-256-GCM with a random 12-byte IV per value. The key comes from
// SECRETS_ENCRYPTION_KEY (32 bytes, base64) when set; otherwise it is derived
// from BETTER_AUTH_SECRET with HKDF, so no extra setup is needed. Changing
// either secret makes saved values unreadable: the school then saves its key
// again. Decrypted values are never logged or sent to the browser.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function key(): Buffer {
  const explicit = process.env.SECRETS_ENCRYPTION_KEY;
  if (explicit) {
    const k = Buffer.from(explicit, 'base64');
    if (k.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
    return k;
  }
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base || base.length < 16) throw new Error('Set SECRETS_ENCRYPTION_KEY or BETTER_AUTH_SECRET to store secrets.');
  return Buffer.from(hkdfSync('sha256', base, 'family-portal', 'secrets:v1', 32));
}

/** Encrypts a secret. `context` (for example "facts:<tenantId>") is bound to the value, so it can't be moved to another school. */
export function encryptSecret(plain: string, context: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  c.setAAD(Buffer.from(context));
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

/** Null when the value can't be read (wrong key, wrong context, tampered). */
export function decryptSecret(sealed: string, context: string): string | null {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== VERSION || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAAD(Buffer.from(context));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
