'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { createLink, deleteLink, updateLink } from '@/server/services/links';
import { errorMessage, str } from '../_components/action-helpers';

type Result = { error?: string; ok?: string } | undefined;

export async function saveLinkAction(tenantKey: string, id: string | null, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  try {
    const input = {
      menu: str(fd, 'menu'),
      label: str(fd, 'label'),
      target: str(fd, 'target'),
      visibility: str(fd, 'visibility') || 'public',
      opensInNewTab: fd.get('opensInNewTab') === 'on',
      isActive: fd.get('isActive') === 'on',
      position: str(fd, 'position') || 0,
    };
    if (id) await updateLink(ctx, id, input);
    else await createLink(ctx, input);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/links?saved=1`);
}

export async function deleteLinkAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteLink(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/links?deleted=1`);
}
