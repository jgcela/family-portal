'use server';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth/auth';
import { getSession, getTenantOr404, tenantBase } from '@/server/request';
import { acceptInvitation, viewInvitation } from '@/server/services/staff';
import { ValidationError } from '@/server/services/modules';

export type AcceptResult = { error?: string; email?: string } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};

/** New person: creates their account, then joins the school. The browser signs in afterwards. */
export async function acceptNewAccountAction(tenantKey: string, token: string, _prev: AcceptResult, fd: FormData): Promise<AcceptResult> {
  const tenant = await getTenantOr404(tenantKey);
  const view = await viewInvitation(tenant.id, token);
  if (view.state !== 'valid') return { error: 'This invitation is no longer valid. Ask the school for a new one.' };
  if (view.existingUser) return { error: 'An account with this email already exists. Sign in to accept.' };
  const name = str(fd, 'name').trim().slice(0, 120);
  const password = str(fd, 'password');
  if (!name) return { error: 'Enter your name.' };
  if (password.length < 12) return { error: 'Use at least 12 characters for your password.' };
  if (password.length > 128) return { error: 'Use at most 128 characters for your password.' };
  if (password !== str(fd, 'confirm')) return { error: 'The two passwords do not match.' };

  const ctx = await auth().$context;
  const created = await ctx.internalAdapter.createUser({ email: view.email, name, emailVerified: true }, { method: 'invitation' } as never);
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await ctx.password.hash(password),
  });
  try {
    await acceptInvitation(tenant.id, token, created.id);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  return { email: view.email };
}

/** Existing account: must be signed in with the invited email. */
export async function acceptExistingAction(tenantKey: string, token: string): Promise<AcceptResult> {
  const tenant = await getTenantOr404(tenantKey);
  const session = await getSession();
  if (!session) return { error: 'Sign in first.' };
  try {
    await acceptInvitation(tenant.id, token, session.user.id);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  redirect(`${await tenantBase(tenantKey)}/admin`);
}
