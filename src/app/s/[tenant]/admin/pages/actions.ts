'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { createPage, deletePage, restorePageVersion, transitionPage, updatePage } from '@/server/services/content';
import type { Transition } from '@/server/services/workflow';
import { errorMessage, ids, str } from '../_components/action-helpers';

type Result = { error?: string; ok?: string } | undefined;

export async function savePageAction(tenantKey: string, id: string | null, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  let savedId: string;
  try {
    const input = {
      title: str(fd, 'title'),
      slug: str(fd, 'slug'),
      body: str(fd, 'body'),
      showToc: fd.get('showToc') === 'on',
      sortOrder: Number(str(fd, 'sortOrder') || '0'),
      audienceIds: ids(fd, 'audienceIds'),
      visibility: str(fd, 'visibility') || 'public',
    };
    savedId = id ? (await updatePage(ctx, id, input)).id : (await createPage(ctx, input)).id;
    const then = str(fd, 'then');
    if (then === 'publish' || then === 'submit') await transitionPage(ctx, savedId, then);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/pages/${savedId}?saved=1`);
}

export async function transitionPageAction(tenantKey: string, id: string, action: Transition): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await transitionPage(ctx, id, action);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(await tenantBase(tenantKey), 'layout');
  return { ok: 'Done.' };
}

export async function restoreVersionAction(tenantKey: string, id: string, versionId: string): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await restorePageVersion(ctx, id, versionId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`${await tenantBase(tenantKey)}/admin/pages/${id}`);
  return { ok: 'Version copied into the draft. Publish to make it live.' };
}

export async function deletePageAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deletePage(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/pages?deleted=1`);
}
