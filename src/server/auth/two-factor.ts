// Two-step sign-in (authenticator app + one-time backup codes).
//
// Better Auth's twoFactor plugin does the cryptography and the sign-in
// challenge. This module adds the platform's rules on top:
//   - Super Admins (platform admins) must have it on to use /platform.
//   - Turning it on signs out every other session of that account, so a
//     session opened before it was on (maybe by someone else) stops working.
//   - An operator with database access can reset it for a locked-out user.
import { and, eq, ne } from 'drizzle-orm';
import QRCode from 'qrcode';
import { auth } from './auth';
import { platformDb, type Db } from '../db/client';
import { auditLogs, platformAdmins, session, twoFactor, user } from '../db/schema';

export class TwoFactorError extends Error {}

/** Platform admins cannot turn it off from the app (they would lose /platform). */
export async function isTwoFactorRequired(userId: string, db: Db = platformDb()): Promise<boolean> {
  const [row] = await db.select({ userId: platformAdmins.userId }).from(platformAdmins).where(eq(platformAdmins.userId, userId));
  return !!row;
}

/** Step 1: check the password and create a new authenticator secret (not active until confirmed). */
export async function startTwoFactorSetup(headers: Headers, password: string) {
  let res: { method: string; totpURI?: string; backupCodes?: string[] };
  try {
    res = await auth().api.enableTwoFactor({ headers, body: { password, method: 'totp' } });
  } catch (err) {
    throw new TwoFactorError(authMessage(err, 'Your password is not correct.'));
  }
  if (!res.totpURI || !res.backupCodes) throw new TwoFactorError('Could not start the setup. Try again.');
  const secret = new URL(res.totpURI).searchParams.get('secret') ?? '';
  const qrSvg = await QRCode.toString(res.totpURI, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { totpURI: res.totpURI, secret, qrSvg, backupCodes: res.backupCodes };
}

/**
 * Step 2 happens in the browser (Better Auth's /two-factor/verify-totp, which
 * turns it on and replaces the browser's session cookie). Step 3, called with
 * that new session: end every other session of the account, so one opened
 * before two-step sign-in was on (maybe by someone else) stops working.
 */
export async function finishTwoFactorSetup(userId: string, keepToken: string, db: Db = platformDb()) {
  const [u] = await db.select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, userId));
  if (!u?.on) throw new TwoFactorError('Two-step sign-in is not on yet. Type the code from the app first.');
  await db.transaction(async (tx) => {
    await tx.delete(session).where(and(eq(session.userId, userId), ne(session.token, keepToken)));
    await tx.insert(auditLogs).values({ tenantId: null, actorUserId: userId, actorKind: 'user', action: 'auth.two_factor_enabled', targetType: 'user', targetId: userId, metadata: {} });
  });
}

/** New set of backup codes (the old ones stop working). Needs the password. */
export async function regenerateBackupCodes(headers: Headers, password: string): Promise<string[]> {
  try {
    const res = await auth().api.generateBackupCodes({ headers, body: { password } });
    return res.backupCodes;
  } catch (err) {
    throw new TwoFactorError(authMessage(err, 'Your password is not correct.'));
  }
}

/** Turn it off (school staff and families only; platform admins are refused). */
export async function disableTwoFactor(headers: Headers, userId: string, password: string, db: Db = platformDb()) {
  if (await isTwoFactorRequired(userId, db)) {
    throw new TwoFactorError('Platform administrators must keep two-step sign-in on.');
  }
  try {
    await auth().api.disableTwoFactor({ headers, body: { password } });
  } catch (err) {
    throw new TwoFactorError(authMessage(err, 'Your password is not correct.'));
  }
  await db.insert(auditLogs).values({ tenantId: null, actorUserId: userId, actorKind: 'user', action: 'auth.two_factor_disabled', targetType: 'user', targetId: userId, metadata: {} });
}

/**
 * Recovery for a locked-out user (lost phone and lost backup codes). Run by
 * an operator with database access (scripts/reset-two-factor.ts), never from
 * the web. Removes the authenticator, turns two-step sign-in off and ends all
 * sessions, so the user signs in with the password and sets it up again.
 */
export async function resetTwoFactorByEmail(email: string, reason: string, db: Db = platformDb()) {
  const normalized = email.trim().toLowerCase();
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, normalized));
  if (!u) throw new TwoFactorError(`No account with the email ${normalized}.`);
  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, u.id));
    await tx.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, u.id));
    await tx.delete(session).where(eq(session.userId, u.id));
    await tx.insert(auditLogs).values({ tenantId: null, actorUserId: null, actorKind: 'system', action: 'auth.two_factor_reset', targetType: 'user', targetId: u.id, metadata: { reason } });
  });
  return { userId: u.id };
}

function authMessage(err: unknown, fallback: string): string {
  const e = err as { body?: { code?: string; message?: string }; status?: string | number };
  const code = e?.body?.code ?? '';
  if (code === 'TOTP_ALREADY_ENABLED' || code === 'TWO_FACTOR_ALREADY_ENABLED') return 'Two-step sign-in is already on for this account.';
  if (code.includes('LOCKED') || code.includes('TOO_MANY')) return 'Too many tries. Wait 15 minutes and try again.';
  if (e?.status === 'TOO_MANY_REQUESTS' || e?.status === 429) return 'Too many tries. Wait a minute and try again.';
  return fallback;
}
