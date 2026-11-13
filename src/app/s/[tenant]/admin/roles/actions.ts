'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { createRoleFromEditor, deleteCustomRole, updateCustomRole } from '@/server/services/people';
import { errorMessage, ids, str } from '../_components/action-helpers';

export type RoleResult = { error?: string; ok?: string } | undefined;

const fields = (fd: FormData) => ({ name: str(fd, 'name'), description: str(fd, 'description'), permissions: ids(fd, 'permission') });

export async function createRoleAction(tenantKey: string, _prev: RoleResult, fd: FormData): Promise<RoleResult> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  let id: string;
  try {
    id = (await createRoleFromEditor(ctx, fields(fd))).id;
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`${base}/admin/roles`);
  redirect(`${base}/admin/roles/${id}?saved=1`);
}

export async function updateRoleAction(tenantKey: string, roleId: string, _prev: RoleResult, fd: FormData): Promise<RoleResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await updateCustomRole(ctx, roleId, fields(fd));
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`${await tenantBase(tenantKey)}/admin/roles`, 'layout');
  return { ok: 'Saved. People with this role get the change on their next page load.' };
}

export async function deleteRoleAction(tenantKey: string, roleId: string): Promise<RoleResult> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  try {
    await deleteCustomRole(ctx, roleId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`${base}/admin/roles`);
  redirect(`${base}/admin/roles`);
}
