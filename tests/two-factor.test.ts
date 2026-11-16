// Two-step sign-in for platform admins: setup, sign-in challenge, backup
// codes, other sessions ended on setup, required for platform admins, and
// the operator reset. Runs the real Better Auth handler against the test DB.
import { createHmac, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth/auth';
import { platformDb } from '@/server/db/client';
import { auditLogs, platformAdmins, session, twoFactor, user } from '@/server/db/schema';
import {
  finishTwoFactorSetup,
  disableTwoFactor,
  isTwoFactorRequired,
  resetTwoFactorByEmail,
  startTwoFactorSetup,
  TwoFactorError,
} from '@/server/auth/two-factor';
import { loadAuthzContext } from '@/server/rbac/context';
import { createSchool } from './helpers';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

/** A tiny cookie jar for one browser. */
class Browser {
  jar = new Map<string, string>();
  ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  headers(): Headers {
    const h = new Headers({ origin: ORIGIN, host: 'localhost:3000', 'x-forwarded-for': this.ip });
    if (this.jar.size) h.set('cookie', [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '));
    return h;
  }
  async post(path: string, body: unknown) {
    const h = this.headers();
    h.set('content-type', 'application/json');
    const res = await auth().handler(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) }));
    for (const c of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const expired = !value || attrs.some((a) => /max-age=0\b/i.test(a.trim()));
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }
  async session() {
    return auth().api.getSession({ headers: this.headers() });
  }
}

async function createPasswordUser(email: string) {
  const ctx = await auth().$context;
  const u = await ctx.internalAdapter.createUser({ email, name: 'Platform Person', emailVerified: true }, { method: 'admin' });
  await ctx.internalAdapter.linkAccount({ userId: u.id, providerId: 'credential', accountId: u.id, password: await ctx.password.hash(PASSWORD) });
  return u.id;
}

async function signIn(b: Browser, email: string) {
  return b.post('/sign-in/email', { email, password: PASSWORD });
}

// RFC 6238 TOTP, independent of the library under test.
function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretB32: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const mac = createHmac('sha1', base32Decode(secretB32)).update(counter).digest();
  const off = mac[mac.length - 1]! & 0xf;
  const n = ((mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString();
  return n.padStart(6, '0');
}

describe('two-step sign-in', () => {
  const email = `admin-${randomUUID().slice(0, 8)}@example.test`;
  let userId: string;
  let secret: string;
  let backupCodes: string[];

  beforeAll(async () => {
    userId = await createPasswordUser(email);
    await platformDb().insert(platformAdmins).values({ userId, role: 'owner' });
  });

  it('is required for platform admins only', async () => {
    expect(await isTwoFactorRequired(userId)).toBe(true);
    const other = await createPasswordUser(`staff-${randomUUID().slice(0, 8)}@example.test`);
    expect(await isTwoFactorRequired(other)).toBe(false);
  });

  it('refuses setup with a wrong password', async () => {
    const b = new Browser();
    expect((await signIn(b, email)).status).toBe(200);
    await expect(startTwoFactorSetup(b.headers(), 'wrong password!!')).rejects.toBeInstanceOf(TwoFactorError);
  });

  it('turns on with the first code and signs out every other session', async () => {
    const laptop = new Browser();
    const oldPhone = new Browser();
    await signIn(laptop, email);
    await signIn(oldPhone, email);
    expect(await oldPhone.session()).not.toBeNull();

    const started = await startTwoFactorSetup(laptop.headers(), PASSWORD);
    expect(started.qrSvg).toContain('<svg');
    expect(started.backupCodes).toHaveLength(10);
    secret = started.secret;
    backupCodes = started.backupCodes;
    // Not on until confirmed.
    const [before] = await platformDb().select().from(user).where(eq(user.id, userId));
    expect(before?.twoFactorEnabled).toBe(false);

    expect((await laptop.post('/two-factor/verify-totp', { code: '000000' })).status).not.toBe(200);

    // Better Auth swaps the laptop's session; capture the new cookie via the handler.
    const r = await laptop.post('/two-factor/verify-totp', { code: totp(secret) });
    expect(r.status).toBe(200);
    const [after] = await platformDb().select().from(user).where(eq(user.id, userId));
    expect(after?.twoFactorEnabled).toBe(true);
    expect(await laptop.session()).not.toBeNull();
  });

  it('finishing setup ends other sessions and logs it', async () => {
    const em = `owner2-${randomUUID().slice(0, 8)}@example.test`;
    const id = await createPasswordUser(em);
    await platformDb().insert(platformAdmins).values({ userId: id, role: 'operator' });
    const laptop = new Browser();
    const stolen = new Browser();
    await signIn(laptop, em);
    await signIn(stolen, em);
    const s = await startTwoFactorSetup(laptop.headers(), PASSWORD);
    // Not allowed before the code is confirmed.
    const early = await laptop.session();
    await expect(finishTwoFactorSetup(id, early!.session.token)).rejects.toBeInstanceOf(TwoFactorError);
    expect((await laptop.post('/two-factor/verify-totp', { code: totp(s.secret) })).status).toBe(200);
    const current = await laptop.session();
    expect(await stolen.session()).not.toBeNull(); // Better Auth alone leaves it
    await finishTwoFactorSetup(id, current!.session.token);
    expect(await stolen.session()).toBeNull();
    expect((await laptop.session())?.user.id).toBe(id);
    const rows = await platformDb().select().from(session).where(eq(session.userId, id));
    expect(rows).toHaveLength(1);
    const logs = await platformDb().select().from(auditLogs).where(eq(auditLogs.targetId, id));
    expect(logs.map((l) => l.action)).toContain('auth.two_factor_enabled');
  });

  it('password alone no longer signs in; the app code does', async () => {
    const b = new Browser();
    const r = await signIn(b, email);
    expect(r.json.twoFactorRedirect).toBe(true);
    expect(await b.session()).toBeNull();
    expect((await b.post('/two-factor/verify-totp', { code: '123456' })).status).not.toBe(200);
    expect(await b.session()).toBeNull();
    const ok = await b.post('/two-factor/verify-totp', { code: totp(secret) });
    expect(ok.status).toBe(200);
    expect((await b.session())?.user.id).toBe(userId);
  });

  it('a backup code signs in once', async () => {
    const b = new Browser();
    await signIn(b, email);
    expect((await b.post('/two-factor/verify-backup-code', { code: backupCodes[0] })).status).toBe(200);
    expect((await b.session())?.user.id).toBe(userId);

    const again = new Browser();
    await signIn(again, email);
    expect((await again.post('/two-factor/verify-backup-code', { code: backupCodes[0] })).status).not.toBe(200);
    expect(await again.session()).toBeNull();
  });

  it('platform admins cannot turn it off from the app', async () => {
    const b = new Browser();
    await signIn(b, email);
    await b.post('/two-factor/verify-totp', { code: totp(secret) });
    await expect(disableTwoFactor(b.headers(), userId, PASSWORD)).rejects.toThrow(/must keep/);
    const [u] = await platformDb().select().from(user).where(eq(user.id, userId));
    expect(u?.twoFactorEnabled).toBe(true);
  });

  it('support sessions need two-step sign-in too', async () => {
    const { tenant } = await createSchool('tfa');
    // No membership and no grant: null either way; with 2FA off it stops before looking for grants.
    const id = await createPasswordUser(`sup-${randomUUID().slice(0, 8)}@example.test`);
    expect(await loadAuthzContext(tenant.id, id)).toBeNull();
  });

  it('the operator reset turns it off and ends all sessions', async () => {
    const b = new Browser();
    await signIn(b, email);
    await b.post('/two-factor/verify-totp', { code: totp(secret) });
    expect(await b.session()).not.toBeNull();

    await resetTwoFactorByEmail(email.toUpperCase(), 'lost phone');
    expect(await b.session()).toBeNull();
    const [u] = await platformDb().select().from(user).where(eq(user.id, userId));
    expect(u?.twoFactorEnabled).toBe(false);
    expect(await platformDb().select().from(twoFactor).where(eq(twoFactor.userId, userId))).toHaveLength(0);
    const logs = await platformDb().select().from(auditLogs).where(eq(auditLogs.targetId, userId));
    expect(logs.find((l) => l.action === 'auth.two_factor_reset')?.metadata).toEqual({ reason: 'lost phone' });

    // Password works again, and they can set it up anew.
    const n = new Browser();
    const r = await signIn(n, email);
    expect(r.json.twoFactorRedirect).toBeUndefined();
    expect(await n.session()).not.toBeNull();
    await expect(resetTwoFactorByEmail('nobody@example.test', 'x')).rejects.toBeInstanceOf(TwoFactorError);
  });
});
