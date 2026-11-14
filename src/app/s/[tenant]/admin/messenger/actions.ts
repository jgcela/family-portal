'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { deleteIssue, saveIssue, updateIssueDetails } from '@/server/services/messenger';
import { errorMessage, str } from '../_components/action-helpers';

type Result = { error?: string; ok?: string } | undefined;

const lines = (v: string) =>
  v
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export async function addIssueAction(tenantKey: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  const f = fd.get('file');
  if (!(f instanceof File) || f.size === 0) return { error: 'Choose the newsletter’s .html file.' };
  if (f.size > 1_500_000) return { error: 'The file is larger than 1.5 MB.' };
  let id: string;
  try {
    const r = await saveIssue(ctx, {
      issueDate: str(fd, 'issueDate'),
      title: str(fd, 'title'),
      excerpt: str(fd, 'excerpt'),
      highlights: lines(str(fd, 'highlights')),
      html: await f.text(),
      visibility: str(fd, 'visibility') || 'public',
      isActive: true,
    });
    id = r.id;
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/messenger/${id}?saved=1`);
}

/** One issue from an import file. The browser sends them one at a time to stay under the request size limit. */
export async function importIssueAction(tenantKey: string, issue: unknown): Promise<{ error?: string; created?: boolean }> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const r = await saveIssue(ctx, issue);
    revalidatePath(await tenantBase(tenantKey), 'layout');
    return { created: r.created };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function updateIssueAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await updateIssueDetails(ctx, id, {
      title: str(fd, 'title'),
      excerpt: str(fd, 'excerpt'),
      highlights: lines(str(fd, 'highlights')),
      visibility: str(fd, 'visibility') || 'public',
      isActive: fd.get('isActive') === 'on',
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(await tenantBase(tenantKey), 'layout');
  return { ok: 'Saved.' };
}

export async function deleteIssueAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteIssue(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/messenger?deleted=1`);
}
