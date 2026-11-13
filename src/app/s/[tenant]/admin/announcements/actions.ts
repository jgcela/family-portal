'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantOr404, requireStaff, tenantBase } from '@/server/request';
import { createAnnouncement, deleteAnnouncement, transitionAnnouncement, updateAnnouncement } from '@/server/services/content';
import type { Transition } from '@/server/services/workflow';
import { zonedTimeToUtc } from '@/server/calendar/time';
import { errorMessage, ids, str } from '../_components/action-helpers';

type Result = { error?: string; ok?: string } | undefined;

function localToIso(v: string, tz: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(v);
  return m ? zonedTimeToUtc(m[1]!, m[2]!, tz).toISOString() : null;
}

export async function saveAnnouncementAction(tenantKey: string, id: string | null, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const tenant = await getTenantOr404(tenantKey);
  const base = await tenantBase(tenantKey);
  let savedId: string;
  try {
    const input = {
      title: str(fd, 'title'),
      summary: str(fd, 'summary') || null,
      body: str(fd, 'body'),
      isUrgent: fd.get('isUrgent') === 'on',
      isPinned: fd.get('isPinned') === 'on',
      audienceIds: ids(fd, 'audienceIds'),
      visibility: str(fd, 'visibility') || 'public',
      publishAt: localToIso(str(fd, 'publishAt'), tenant.timezone),
      expiresAt: localToIso(str(fd, 'expiresAt'), tenant.timezone),
    };
    savedId = id ? (await updateAnnouncement(ctx, id, input)).id : (await createAnnouncement(ctx, input)).id;
    const then = str(fd, 'then');
    if (then === 'publish' || then === 'submit') await transitionAnnouncement(ctx, savedId, then);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/announcements/${savedId}?saved=1`);
}

export async function transitionAnnouncementAction(tenantKey: string, id: string, action: Transition): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await transitionAnnouncement(ctx, id, action);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(await tenantBase(tenantKey), 'layout');
  return { ok: 'Done.' };
}

export async function deleteAnnouncementAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteAnnouncement(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/announcements?deleted=1`);
}
