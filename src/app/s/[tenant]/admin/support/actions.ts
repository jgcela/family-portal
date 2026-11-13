'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff, tenantBase } from '@/server/request';
import { approveSupportGrant, declineSupportGrant, revokeSupportGrant } from '@/server/services/support';
import { errorMessage } from '../_components/action-helpers';

export type SupportResult = { error?: string; ok?: string } | undefined;

const ACTIONS = { approve: approveSupportGrant, decline: declineSupportGrant, revoke: revokeSupportGrant };
const DONE = { approve: 'Access approved.', decline: 'Request declined.', revoke: 'Access ended.' };

export async function supportDecisionAction(tenantKey: string, grantId: string, decision: keyof typeof ACTIONS): Promise<SupportResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await ACTIONS[decision](ctx, grantId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(`${base}/admin/support`);
  revalidatePath(`${base}/admin`);
  return { ok: DONE[decision] };
}
