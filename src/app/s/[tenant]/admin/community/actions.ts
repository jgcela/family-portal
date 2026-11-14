'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { createCommunityItem, deleteCommunityItem, importCommunity, updateCommunityItem, MAX_DETAILS } from '@/server/services/community';
import { errorMessage, str } from '../_components/action-helpers';

type Result = { error?: string; ok?: string } | undefined;

function detailsFrom(fd: FormData) {
  const out: { label: string; value: string }[] = [];
  for (let i = 0; i < MAX_DETAILS; i++) {
    const label = str(fd, `d${i}Label`);
    const value = str(fd, `d${i}Value`);
    if (label || value) out.push({ label, value });
  }
  return out;
}

export async function saveCommunityAction(tenantKey: string, id: string | null, kind: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  try {
    const input = {
      kind,
      groupName: str(fd, 'groupName'),
      name: str(fd, 'name'),
      role: str(fd, 'role'),
      url: str(fd, 'url'),
      details: kind === 'favorites' ? detailsFrom(fd) : [],
      visibility: str(fd, 'visibility') || undefined,
      isActive: fd.get('isActive') === 'on',
      sortOrder: str(fd, 'sortOrder') || 0,
    };
    if (id) await updateCommunityItem(ctx, id, input);
    else await createCommunityItem(ctx, input);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/community?kind=${kind}&saved=1`);
}

export async function deleteCommunityAction(tenantKey: string, id: string, kind: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteCommunityItem(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/community?kind=${kind}&deleted=1`);
}

export async function importCommunityAction(tenantKey: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const f = fd.get('file');
  if (!(f instanceof File) || f.size === 0) return { error: 'Choose a file.' };
  if (f.size > 1024 * 1024) return { error: 'The file is larger than 1 MB.' };
  try {
    const r = await importCommunity(ctx, await f.text());
    revalidatePath(await tenantBase(tenantKey), 'layout');
    return { ok: `${r.created} added${r.skipped ? `, ${r.skipped} skipped because they already exist` : ''}.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
