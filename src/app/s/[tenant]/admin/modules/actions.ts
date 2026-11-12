'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError } from '@/server/rbac/authorize';
import { setModuleEnabled, ValidationError } from '@/server/services/modules';

export type ToggleState = { error?: string } | undefined;

export async function toggleModuleAction(tenantKey: string, moduleId: string, enable: boolean): Promise<ToggleState> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await setModuleEnabled(ctx, moduleId, enable);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    if (err instanceof AuthorizationError) return { error: 'You do not have permission to change modules.' };
    throw err;
  }
  // Navigation and homepage blocks depend on active modules.
  revalidatePath(await tenantBase(tenantKey), 'layout');
  return undefined;
}
