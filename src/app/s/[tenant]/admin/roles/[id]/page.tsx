import Link from 'next/link';
import { notFound } from 'next/navigation';
import { count, eq, sql } from 'drizzle-orm';
import { withTenant } from '@/server/db/client';
import { membershipRoles } from '@/server/db/schema';
import { requireStaff, tenantBase } from '@/server/request';
import { getRoleForEditor } from '@/server/services/people';
import { PERMISSIONS } from '@/server/rbac/permissions';
import { DeleteRoleButton, RoleEditor } from '../editor';
import { deleteRoleAction, updateRoleAction } from '../actions';
import { canManageRoles, permissionOptions } from '../shared';

export const metadata = { title: 'Edit role' };

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditRole({ params, searchParams }: Props) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const role = await getRoleForEditor(ctx, id).catch(() => null);
  if (!role) notFound();
  const base = await tenantBase(key);
  const saved = (await searchParams).saved === '1';
  const [usage] = await withTenant(tenant.id, (tx) =>
    tx
      .select({ all: count(), limited: sql<number>`count(*) filter (where ${membershipRoles.scopeType} <> 'school')`.mapWith(Number) })
      .from(membershipRoles)
      .where(eq(membershipRoles.roleId, role.id)),
  );
  const editable = canManageRoles(ctx) && !role.isSystem && !role.isOwnerRole;
  const held = new Set(role.permissions);
  return (
    <>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/roles`}>← Roles & Permissions</Link>
          </p>
          <h1>{role.name}</h1>
          <p className="muted">
            {role.isSystem ? 'Built-in role. ' : 'Custom role. '}
            {usage?.all ? `${usage.all} people have it.` : 'Nobody has it yet.'}
          </p>
        </div>
        {canManageRoles(ctx) && !role.isOwnerRole && (
          <Link className="btn btn-quiet" href={`${base}/admin/roles/new?from=${role.id}`}>
            Duplicate
          </Link>
        )}
      </div>
      {saved && (
        <div className="notice notice-ok" role="status">
          Role created. Give it to people from the Staff page.
        </div>
      )}
      <section className="panel">
        <div className="panel-body">
          {editable ? (
            <RoleEditor
              run={updateRoleAction.bind(null, key, role.id)}
              defaults={{ name: role.name, description: role.description ?? '', permissions: role.permissions }}
              options={permissionOptions(ctx)}
              submitLabel="Save role"
              limitedGrants={(usage?.limited ?? 0) > 0}
            />
          ) : (
            <>
              <p className="muted">
                {role.isOwnerRole
                  ? 'The owner role always has every permission.'
                  : 'Built-in roles cannot be changed. Use Duplicate to make an editable copy.'}
              </p>
              <ul className="perm-readonly">
                {PERMISSIONS.filter((p) => held.has(p.key)).map((p) => (
                  <li key={p.key}>{p.label}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
      {editable && (
        <section className="panel">
          <div className="panel-body">
            <p className="muted">Deleting is only possible when nobody has this role and no pending invitation uses it.</p>
            <DeleteRoleButton run={deleteRoleAction.bind(null, key, role.id)} />
          </div>
        </section>
      )}
    </>
  );
}
