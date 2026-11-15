'use server';
import { headers } from 'next/headers';
import { getTenantOr404, getViewer } from '@/server/request';
import { askSchool, recordFeedback } from '@/server/services/assistant';
import { ValidationError } from '@/server/errors';
import type { AskState } from '@/app/_ai/answer-view';

export async function askAction(tenantKey: string, _prev: AskState, fd: FormData): Promise<AskState> {
  const question = String(fd.get('question') ?? '').slice(0, 1000);
  const tenant = await getTenantOr404(tenantKey);
  const viewer = await getViewer(tenant.id);
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || null;
  try {
    const result = await askSchool({ tenantId: tenant.id, viewer, question, ip });
    return { result, question };
  } catch (err) {
    if (err instanceof ValidationError || (err instanceof Error && err.name === 'AssistantUnavailableError')) return { error: err.message, question };
    console.error(err);
    return { error: 'Something went wrong. Please try again.', question };
  }
}

export async function feedbackAction(tenantKey: string, questionId: string, helpful: boolean) {
  const tenant = await getTenantOr404(tenantKey);
  await recordFeedback(tenant.id, await getViewer(tenant.id), questionId, helpful);
}
