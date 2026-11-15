'use server';
import { revalidatePath } from 'next/cache';
import { getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { submitNotice, cancelNotice } from '@/server/services/attendance';
import { cancelFamilyRequest, createFamilyRequest, familyReply } from '@/server/services/inbox';
import { ValidationError } from '@/server/errors';
import { AuthorizationError } from '@/server/rbac/authorize';
import { ZodError } from 'zod';

export type FormResult = { error?: string; ok?: string; id?: string; number?: number } | undefined;

function message(err: unknown): string {
  if (err instanceof ValidationError || err instanceof AuthorizationError) return err.message;
  if (err instanceof ZodError) return err.issues[0]?.message ?? 'Check the form and try again.';
  console.error(err);
  return 'Something went wrong. Please try again or call the office.';
}

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

async function setup(tenantKey: string) {
  const tenant = await getTenantOr404(tenantKey);
  return { tenant, viewer: await getViewer(tenant.id), base: await tenantBase(tenantKey) };
}

export async function absenceAction(tenantKey: string, _p: FormResult, fd: FormData): Promise<FormResult> {
  const { tenant, viewer, base } = await setup(tenantKey);
  try {
    const { notice } = await submitNotice(tenant.id, viewer, {
      studentId: s(fd, 'studentId'),
      type: s(fd, 'type'),
      dateFrom: s(fd, 'dateFrom'),
      dateTo: s(fd, 'dateTo'),
      time: s(fd, 'time'),
      reason: s(fd, 'reason'),
      comment: s(fd, 'comment'),
      idempotencyKey: s(fd, 'idempotencyKey'),
    });
    revalidatePath(`${base}/requests`);
    return { ok: notice.status === 'approved' ? 'Recorded. No further action is needed.' : 'Sent. The office will review it.', id: notice.inboxItemId ?? undefined };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function newRequestAction(tenantKey: string, _p: FormResult, fd: FormData): Promise<FormResult> {
  const { tenant, viewer, base } = await setup(tenantKey);
  try {
    const item = await createFamilyRequest(tenant.id, viewer, { kind: s(fd, 'kind') || 'request', subject: s(fd, 'subject'), body: s(fd, 'body'), studentId: s(fd, 'studentId') });
    revalidatePath(`${base}/requests`);
    return { ok: `Sent as R-${item.number}.`, id: item.id, number: item.number };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function replyAction(tenantKey: string, id: string, _p: FormResult, fd: FormData): Promise<FormResult> {
  const { tenant, viewer, base } = await setup(tenantKey);
  try {
    await familyReply(tenant.id, viewer, id, s(fd, 'body'));
    revalidatePath(`${base}/requests/${id}`);
    return { ok: 'Message sent.' };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function cancelAction(tenantKey: string, id: string, noticeId: string | null, _p: FormResult, _fd: FormData): Promise<FormResult> {
  const { tenant, viewer, base } = await setup(tenantKey);
  try {
    if (noticeId) await cancelNotice(tenant.id, viewer, noticeId);
    else await cancelFamilyRequest(tenant.id, viewer, id);
    revalidatePath(`${base}/requests/${id}`);
    return { ok: 'Cancelled.' };
  } catch (err) {
    return { error: message(err) };
  }
}
