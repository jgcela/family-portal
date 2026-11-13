'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/server/request';
import { createSchool } from '@/server/services/platform';
import { platformError, portalUrl, type PlatformResult } from '../../_components/actions-shared';

export async function createSchoolAction(_prev: PlatformResult, input: unknown): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  try {
    const { tenant, token } = await createSchool(ctx, input);
    revalidatePath('/platform');
    return { ok: `${tenant.name} was created.`, schoolId: tenant.id, link: `${await portalUrl(tenant.slug)}/invite/${token}` };
  } catch (err) {
    return platformError(err);
  }
}
