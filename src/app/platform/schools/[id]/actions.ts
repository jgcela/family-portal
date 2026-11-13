'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/server/request';
import {
  changeSchoolStatus,
  issueOwnerInvitation,
  revokeOwnerInvitation,
  updateSubscription,
  type SchoolStatusChange,
} from '@/server/services/platform';
import { endMySupportAccess, requestSupportAccess } from '@/server/services/support';
import { platformDb } from '@/server/db/client';
import { tenants } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { platformError, portalUrl, type PlatformResult } from '../../_components/actions-shared';

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

export async function statusAction(tenantId: string, change: SchoolStatusChange, _p: PlatformResult, fd: FormData): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  try {
    await changeSchoolStatus(ctx, tenantId, change, s(fd, 'reason'));
    revalidatePath(`/platform/schools/${tenantId}`);
    revalidatePath('/platform');
    return { ok: change === 'launch' ? 'The school is live.' : change === 'suspend' ? 'The school is suspended.' : 'The school is live again.' };
  } catch (err) {
    return platformError(err);
  }
}

export async function subscriptionAction(tenantId: string, _p: PlatformResult, fd: FormData): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  try {
    await updateSubscription(ctx, tenantId, {
      planId: s(fd, 'planId'),
      status: s(fd, 'status'),
      extraModules: fd.getAll('extraModules').filter((x): x is string => typeof x === 'string'),
      trialEndsAt: s(fd, 'trialEndsAt'),
      renewsAt: s(fd, 'renewsAt'),
    });
    revalidatePath(`/platform/schools/${tenantId}`);
    revalidatePath('/platform');
    return { ok: 'Plan saved.' };
  } catch (err) {
    return platformError(err);
  }
}

export async function ownerInviteAction(tenantId: string, _p: PlatformResult, fd: FormData): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  try {
    const token = await issueOwnerInvitation(ctx, tenantId, { name: s(fd, 'name'), email: s(fd, 'email') });
    const [t] = await platformDb().select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId));
    revalidatePath(`/platform/schools/${tenantId}`);
    return { ok: 'Invitation created.', link: `${await portalUrl(t!.slug)}/invite/${token}` };
  } catch (err) {
    return platformError(err);
  }
}

export async function revokeInviteAction(tenantId: string, invitationId: string): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  try {
    await revokeOwnerInvitation(ctx, tenantId, invitationId);
    revalidatePath(`/platform/schools/${tenantId}`);
    return { ok: 'Invitation cancelled.' };
  } catch (err) {
    return platformError(err);
  }
}

export async function requestSupportAction(tenantId: string, _p: PlatformResult, fd: FormData): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  try {
    await requestSupportAccess(ctx, tenantId, {
      reason: s(fd, 'reason'),
      scopes: fd.getAll('scopes').filter((x): x is string => typeof x === 'string'),
      hours: s(fd, 'hours'),
    });
    revalidatePath(`/platform/schools/${tenantId}`);
    return { ok: 'Request sent. The School Owner sees it in their dashboard under Support access.' };
  } catch (err) {
    return platformError(err);
  }
}

export async function endSupportAction(tenantId: string, grantId: string): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  try {
    await endMySupportAccess(ctx, grantId);
    revalidatePath(`/platform/schools/${tenantId}`);
    return { ok: 'Closed.' };
  } catch (err) {
    return platformError(err);
  }
}
