import 'server-only';
import { can, schoolWidePermissions, type AuthzContext } from '@/server/rbac/authorize';
import { PERMISSIONS } from '@/server/rbac/permissions';
import type { PermissionOption } from './editor';

/** Which boxes the current person may tick. Mirrors the server-side checks. */
export function permissionOptions(ctx: AuthzContext): PermissionOption[] {
  const ceiling = schoolWidePermissions(ctx);
  return PERMISSIONS.map((p) => {
    let reason: string | undefined;
    if (p.ownerOnly) reason = 'owner only';
    else if (!ceiling.has(p.key)) reason = 'you do not have this';
    return { key: p.key, label: p.label, group: p.group, scopable: p.scopable, allowed: !reason, reason };
  });
}

export const canManageRoles = (ctx: AuthzContext) => can(ctx, 'roles.manage');
