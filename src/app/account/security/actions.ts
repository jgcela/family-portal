'use server';
import { headers } from 'next/headers';
import { getSession } from '@/server/request';
import {
  finishTwoFactorSetup,
  disableTwoFactor,
  regenerateBackupCodes,
  startTwoFactorSetup,
  TwoFactorError,
} from '@/server/auth/two-factor';

export type SetupStart = { error?: string; qrSvg?: string; secret?: string; backupCodes?: string[] };
export type SimpleResult = { error?: string; ok?: boolean; backupCodes?: string[] };

function fail(err: unknown): { error: string } {
  if (err instanceof TwoFactorError) return { error: err.message };
  console.error(err);
  return { error: 'Something went wrong. Please try again.' };
}

export async function startSetupAction(password: string): Promise<SetupStart> {
  if (!(await getSession())) return { error: 'Your session ended. Sign in again.' };
  try {
    const r = await startTwoFactorSetup(await headers(), password);
    return { qrSvg: r.qrSvg, secret: r.secret, backupCodes: r.backupCodes };
  } catch (err) {
    return fail(err);
  }
}

/** After the browser confirmed the first code: sign out everywhere else. */
export async function finishSetupAction(): Promise<SimpleResult> {
  const s = await getSession();
  if (!s) return { error: 'Your session ended. Sign in again.' };
  try {
    await finishTwoFactorSetup(s.user.id, s.session.token);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function regenerateCodesAction(password: string): Promise<SimpleResult> {
  if (!(await getSession())) return { error: 'Your session ended. Sign in again.' };
  try {
    return { ok: true, backupCodes: await regenerateBackupCodes(await headers(), password) };
  } catch (err) {
    return fail(err);
  }
}

export async function disableAction(password: string): Promise<SimpleResult> {
  const session = await getSession();
  if (!session) return { error: 'Your session ended. Sign in again.' };
  try {
    await disableTwoFactor(await headers(), session.user.id, password);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
