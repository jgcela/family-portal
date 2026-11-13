'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PREVIEW_COOKIE, requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';

/** Shows this editor the school's draft theme and homepage on the real portal. */
export async function startPreviewAction(tenantKey: string) {
  const { tenant, ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  if (!hasAnywhere(ctx, 'branding.manage') && !hasAnywhere(ctx, 'homepage.edit')) redirect(`${base}/admin`);
  (await cookies()).set(PREVIEW_COOKIE, tenant.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 2,
  });
  redirect(base || '/');
}

export async function exitPreviewAction(tenantKey: string) {
  (await cookies()).delete(PREVIEW_COOKIE);
  redirect(`${await tenantBase(tenantKey)}/admin/design`);
}
