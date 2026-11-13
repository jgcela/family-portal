import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { getRoleForEditor } from '@/server/services/people';
import { getPermission } from '@/server/rbac/permissions';
import { RoleEditor } from '../editor';
import { createRoleAction } from '../actions';
import { canManageRoles, permissionOptions } from '../shared';

export const metadata = { title: 'New role' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ from?: string }> };

export default async function NewRole({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { ctx } = await requireStaff(key);
  if (!canManageRoles(ctx)) notFound();
  const base = await tenantBase(key);
  const from = (await searchParams).from;
  const source = from ? await getRoleForEditor(ctx, from) : null;
  const options = permissionOptions(ctx);
  const allowed = new Set(options.filter((o) => o.allowed).map((o) => o.key));
  // Copying a role keeps only what this person may grant.
  const copied = (source?.permissions ?? []).filter((p) => allowed.has(p) && getPermission(p));
  const dropped = (source?.permissions.length ?? 0) - copied.length;
  return (
    <>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/roles`}>← Roles & Permissions</Link>
          </p>
          <h1>{source ? `New role based on ${source.name}` : 'New role'}</h1>
          {dropped > 0 && <p className="muted">{dropped} permissions from the original were left out because only the owner or someone with more access can grant them.</p>}
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <RoleEditor
            run={createRoleAction.bind(null, key)}
            defaults={{ name: source ? `${source.name} (copy)` : '', description: source?.description ?? '', permissions: copied }}
            options={options}
            submitLabel="Create role"
            limitedGrants={false}
          />
        </div>
      </section>
    </>
  );
}
