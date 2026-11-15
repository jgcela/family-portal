'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { confirmAction, deleteConversation, dismissAction, sendMessage } from '@/server/services/family-assistant';
import { ValidationError } from '@/server/errors';

export type ChatState = { error?: string; text?: string } | undefined;
export type DraftState = { error?: string; ok?: string } | undefined;

function message(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  console.error(err);
  return 'Something went wrong. Please try again or call the office.';
}

async function setup(tenantKey: string) {
  const tenant = await getTenantOr404(tenantKey);
  return { tenant, viewer: await getViewer(tenant.id), base: await tenantBase(tenantKey) };
}

export async function sendAction(tenantKey: string, conversationId: string | null, _p: ChatState, fd: FormData): Promise<ChatState> {
  const text = String(fd.get('message') ?? '').trim();
  const { tenant, viewer, base } = await setup(tenantKey);
  let id: string;
  try {
    id = (await sendMessage(tenant.id, viewer, conversationId, text)).conversationId;
  } catch (err) {
    return { error: message(err), text };
  }
  revalidatePath(`${base}/assistant`);
  redirect(`${base}/assistant?c=${id}#latest`);
}

export async function confirmDraftAction(tenantKey: string, actionId: string, _p: DraftState): Promise<DraftState> {
  const { tenant, viewer, base } = await setup(tenantKey);
  try {
    const { ref } = await confirmAction(tenant.id, viewer, actionId);
    revalidatePath(`${base}/assistant`);
    return { ok: ref === 'sent' ? 'Sent to the office.' : `Sent to the office as ${ref}.` };
  } catch (err) {
    revalidatePath(`${base}/assistant`);
    return { error: message(err) };
  }
}

export async function dismissDraftAction(tenantKey: string, actionId: string, _p: DraftState): Promise<DraftState> {
  const { tenant, viewer, base } = await setup(tenantKey);
  try {
    await dismissAction(tenant.id, viewer, actionId);
    revalidatePath(`${base}/assistant`);
    return { ok: 'Discarded. Nothing was sent.' };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function deleteConversationAction(tenantKey: string, conversationId: string) {
  const { tenant, viewer, base } = await setup(tenantKey);
  await deleteConversation(tenant.id, viewer, conversationId);
  revalidatePath(`${base}/assistant`);
  redirect(`${base}/assistant`);
}
