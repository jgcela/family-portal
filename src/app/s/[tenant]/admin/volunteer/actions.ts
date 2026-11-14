'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { createVolunteer, deleteVolunteer, importVolunteer, transitionVolunteer, updateVolunteer } from '@/server/services/volunteer';
import type { Transition } from '@/server/services/workflow';
import { errorMessage, ids, str } from '../_components/action-helpers';

type Result = { error?: string; ok?: string } | undefined;

function actionsFrom(fd: FormData) {
  const out: { label: string; url: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const label = str(fd, `action${i}Label`);
    const url = str(fd, `action${i}Url`);
    if (label || url) out.push({ label, url });
  }
  return out;
}

export async function saveVolunteerAction(tenantKey: string, id: string | null, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  let savedId: string;
  try {
    const input = {
      title: str(fd, 'title'),
      category: str(fd, 'category'),
      organizer: str(fd, 'organizer'),
      location: str(fd, 'location'),
      schedule: str(fd, 'schedule'),
      commitment: str(fd, 'commitment'),
      summary: str(fd, 'summary'),
      body: str(fd, 'body'),
      actions: actionsFrom(fd),
      sortOrder: str(fd, 'sortOrder') || 0,
      audienceIds: ids(fd, 'audienceIds'),
      visibility: str(fd, 'visibility') || 'families',
    };
    savedId = id ? (await updateVolunteer(ctx, id, input)).id : (await createVolunteer(ctx, input)).id;
    const then = str(fd, 'then');
    if (then === 'publish' || then === 'submit') await transitionVolunteer(ctx, savedId, then);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/volunteer/${savedId}?saved=1`);
}

export async function transitionVolunteerAction(tenantKey: string, id: string, action: Transition): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await transitionVolunteer(ctx, id, action);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(await tenantBase(tenantKey), 'layout');
  return { ok: 'Done.' };
}

export async function deleteVolunteerAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteVolunteer(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/volunteer?deleted=1`);
}

export async function importVolunteerAction(tenantKey: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const f = fd.get('file');
  if (!(f instanceof File) || f.size === 0) return { error: 'Choose a file.' };
  if (f.size > 1024 * 1024) return { error: 'The file is larger than 1 MB.' };
  try {
    const r = await importVolunteer(ctx, await f.text(), { publish: str(fd, 'then') === 'publish' });
    revalidatePath(await tenantBase(tenantKey), 'layout');
    return { ok: `${r.created} added${r.skipped ? `, ${r.skipped} skipped because an opportunity with the same title already exists` : ''}.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
