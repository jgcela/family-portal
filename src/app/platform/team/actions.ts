'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/server/request';
import { addPlatformMember, removePlatformMember, setPlatformRole } from '@/server/services/platform-ops';
import { platformError, type PlatformResult } from '../_components/actions-shared';

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

async function run(fn: () => Promise<unknown>, ok: string): Promise<PlatformResult> {
  try {
    await fn();
  } catch (err) {
    return platformError(err);
  }
  revalidatePath('/platform/team');
  return { ok };
}

export async function addMemberAction(_p: PlatformResult, fd: FormData): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  return run(() => addPlatformMember(ctx, s(fd, 'email'), s(fd, 'role')), 'Added.');
}

export async function roleAction(userId: string, _p: PlatformResult, fd: FormData): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  return run(() => setPlatformRole(ctx, userId, s(fd, 'role')), 'Role saved.');
}

export async function removeMemberAction(userId: string): Promise<PlatformResult> {
  const { ctx } = await requirePlatformAdmin();
  return run(() => removePlatformMember(ctx, userId), 'Removed.');
}
