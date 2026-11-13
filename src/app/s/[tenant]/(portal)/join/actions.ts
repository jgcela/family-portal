'use server';
import { auth } from '@/server/auth/auth';
import { getSession, getTenantOr404 } from '@/server/request';
import { checkJoinCode, requestToJoin } from '@/server/services/families';
import { ValidationError } from '@/server/services/modules';

export type JoinValues = { name?: string; email?: string; code?: string; note?: string; gradeIds?: string[] };
export type JoinResult = { error?: string; email?: string; done?: boolean; values?: JoinValues } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};
const grades = (fd: FormData) => fd.getAll('gradeIds').filter((v): v is string => typeof v === 'string');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function request(fd: FormData) {
  return { code: str(fd, 'code'), gradeIds: grades(fd), note: str(fd, 'note').trim() };
}

/** New family: checks the code and form first, so nothing is created on a mistake. */
function keep(fd: FormData): JoinValues {
  return { name: str(fd, 'name').slice(0, 120), email: str(fd, 'email').slice(0, 254), code: str(fd, 'code').slice(0, 40), note: str(fd, 'note').slice(0, 1000), gradeIds: grades(fd) };
}

// Forms reset after an action; on an error, send the typed values back (never the password).
export async function joinWithNewAccountAction(tenantKey: string, prev: JoinResult, fd: FormData): Promise<JoinResult> {
  const r = await newAccount(tenantKey, fd);
  return r?.error ? { ...r, values: keep(fd) } : r;
}

export async function joinWithExistingAccountAction(tenantKey: string, prev: JoinResult, fd: FormData): Promise<JoinResult> {
  const r = await existingAccount(tenantKey, fd);
  return r?.error ? { ...r, values: keep(fd) } : r;
}

async function newAccount(tenantKey: string, fd: FormData): Promise<JoinResult> {
  const tenant = await getTenantOr404(tenantKey);
  const name = str(fd, 'name').trim().slice(0, 120);
  const email = str(fd, 'email').trim().toLowerCase();
  const password = str(fd, 'password');
  const req = request(fd);
  if (!name) return { error: 'Enter your name.' };
  if (!EMAIL.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };
  if (password.length < 12) return { error: 'Use at least 12 characters for your password.' };
  if (password.length > 128) return { error: 'Use at most 128 characters for your password.' };
  if (password !== str(fd, 'confirm')) return { error: 'The two passwords do not match.' };
  if (!(await checkJoinCode(tenant.id, req.code))) return { error: 'That school code is not right. Check it with the school office.' };
  if (req.gradeIds.length === 0) return { error: 'Choose at least one grade.' };
  if (!req.note) return { error: "Tell the office your children's names and grades so they can confirm your family." };

  const ctx = await auth().$context;
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    return { error: 'An account with this email already exists. Sign in first, then come back to this page.' };
  }
  // Email ownership is not verified yet (no email provider); the office checks each request.
  const created = await ctx.internalAdapter.createUser({ email, name, emailVerified: false }, { method: 'family-join' } as never);
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await ctx.password.hash(password),
  });
  try {
    await requestToJoin(tenant.id, created.id, req);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  return { email, done: true };
}

/** Signed-in person asking to join as a family. */
async function existingAccount(tenantKey: string, fd: FormData): Promise<JoinResult> {
  const tenant = await getTenantOr404(tenantKey);
  const session = await getSession();
  if (!session) return { error: 'Sign in first.' };
  try {
    await requestToJoin(tenant.id, session.user.id, request(fd));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  return { done: true };
}
