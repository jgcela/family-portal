'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireStaff, tenantBase } from '@/server/request';
import { inviteStaff, removeMember, revokeInvitation, setMemberSuspended } from '@/server/services/staff';
import { assignRole, revokeRole } from '@/server/services/people';
import type { ScopeType } from '@/server/rbac/authorize';
import { errorMessage, str } from '../_components/action-helpers';

export type StaffResult = { error?: string; ok?: string; link?: string } | undefined;

async function refresh(tenantKey: string) {
  revalidatePath(`${await tenantBase(tenantKey)}/admin/staff`);
}

function scopeFrom(fd: FormData): { scopeType: ScopeType; scopeId: string | null } {
  const v = str(fd, 'scope');
  if (v.startsWith('grade:')) return { scopeType: 'grade', scopeId: v.slice(6) };
  if (v.startsWith('audience:')) return { scopeType: 'audience', scopeId: v.slice(9) };
  return { scopeType: 'school', scopeId: null };
}

export async function inviteAction(tenantKey: string, _prev: StaffResult, fd: FormData): Promise<StaffResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const { token } = await inviteStaff(ctx, {
      email: str(fd, 'email'),
      name: str(fd, 'name'),
      title: str(fd, 'title'),
      roleId: str(fd, 'roleId'),
      ...scopeFrom(fd),
    });
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    await refresh(tenantKey);
    return { ok: 'Invitation created.', link: `${proto}://${host}${await tenantBase(tenantKey)}/invite/${token}` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function revokeInviteAction(tenantKey: string, id: string): Promise<StaffResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await revokeInvitation(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await refresh(tenantKey);
  return { ok: 'Invitation cancelled.' };
}

export async function suspendAction(tenantKey: string, membershipId: string, suspend: boolean): Promise<StaffResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await setMemberSuspended(ctx, membershipId, suspend);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await refresh(tenantKey);
  return { ok: suspend ? 'Access suspended.' : 'Access restored.' };
}

export async function removeAction(tenantKey: string, membershipId: string): Promise<StaffResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await removeMember(ctx, membershipId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await refresh(tenantKey);
  return { ok: 'Removed from the school.' };
}

export async function addRoleAction(tenantKey: string, membershipId: string, _prev: StaffResult, fd: FormData): Promise<StaffResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await assignRole(ctx, { membershipId, roleId: str(fd, 'roleId'), ...scopeFrom(fd) });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await refresh(tenantKey);
  return { ok: 'Role added.' };
}

export async function removeRoleAction(tenantKey: string, membershipRoleId: string): Promise<StaffResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await revokeRole(ctx, membershipRoleId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await refresh(tenantKey);
  return { ok: 'Role removed.' };
}
