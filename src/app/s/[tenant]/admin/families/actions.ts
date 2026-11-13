'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff, tenantBase } from '@/server/request';
import { approveFamilyRequest, rejectFamilyRequest, setFamilyGrades, setJoinCode } from '@/server/services/families';
import { removeMember, setMemberSuspended } from '@/server/services/staff';
import { errorMessage, ids } from '../_components/action-helpers';

export type FamilyResult = { error?: string; ok?: string } | undefined;

async function run(tenantKey: string, fn: (ctx: Awaited<ReturnType<typeof requireStaff>>['ctx']) => Promise<unknown>, ok: string): Promise<FamilyResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await fn(ctx);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`${await tenantBase(tenantKey)}/admin/families`);
  return { ok };
}

export const joinCodeAction = async (tenantKey: string, open: boolean): Promise<FamilyResult> =>
  run(tenantKey, (ctx) => setJoinCode(ctx, open), open ? 'New code ready.' : 'Joining closed.');

export const approveAction = async (tenantKey: string, requestId: string, _prev: FamilyResult, fd: FormData): Promise<FamilyResult> =>
  run(tenantKey, (ctx) => approveFamilyRequest(ctx, requestId, ids(fd, 'gradeIds')), 'Approved.');

export const rejectAction = async (tenantKey: string, requestId: string): Promise<FamilyResult> =>
  run(tenantKey, (ctx) => rejectFamilyRequest(ctx, requestId), 'Request declined.');

export const gradesAction = async (tenantKey: string, membershipId: string, _prev: FamilyResult, fd: FormData): Promise<FamilyResult> =>
  run(tenantKey, (ctx) => setFamilyGrades(ctx, membershipId, ids(fd, 'gradeIds')), 'Grades saved.');

export const suspendFamilyAction = async (tenantKey: string, membershipId: string, suspend: boolean): Promise<FamilyResult> =>
  run(tenantKey, (ctx) => setMemberSuspended(ctx, membershipId, suspend), suspend ? 'Access suspended.' : 'Access restored.');

export const removeFamilyAction = async (tenantKey: string, membershipId: string): Promise<FamilyResult> =>
  run(tenantKey, (ctx) => removeMember(ctx, membershipId), 'Removed.');
