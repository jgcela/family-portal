import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { withTenant } from '@/server/db/client';
import { rolePermissions, roles } from '@/server/db/schema';
import { hasAnywhere } from '@/server/rbac/authorize';
import { PERMISSIONS } from '@/server/rbac/permissions';
import { requireStaff } from '@/server/request';

export const metadata = { title: 'Roles & Permissions' };

type Props = { params: Promise<{ tenant: string }> };

export default async function RolesPage({ params }: Props) {
  const { tenant, ctx } = await requireStaff((await params).tenant);
  if (!hasAnywhere(ctx, 'roles.view')) notFound();
  const { roleRows, perms } = await withTenant(tenant.id, async (tx) => ({
    roleRows: await tx.select().from(roles).orderBy(asc(roles.createdAt)),
    perms: await tx.select().from(rolePermissions),
  }));
  const has = new Set(perms.map((p) => `${p.roleId}:${p.permission}`));
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Roles & Permissions</h1>
          <p>
            What each role can do. Anything not ticked is denied. Roles can be given for the whole school or limited
            to a grade or audience.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="data matrix">
            <caption className="visually-hidden">Permissions by role</caption>
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {roleRows.map((r) => (
                  <th scope="col" className="cell" key={r.id} title={r.description ?? undefined}>
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="group-row">
                    <th colSpan={roleRows.length + 1} scope="colgroup">
                      {g}
                    </th>
                  </tr>
                  {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                    <tr key={p.key}>
                      <th scope="row" style={{ fontWeight: 400 }}>
                        {p.label}
                        {p.ownerOnly && <span className="badge" style={{ marginLeft: 8 }}>Owner only</span>}
                      </th>
                      {roleRows.map((r) =>
                        has.has(`${r.id}:${p.key}`) ? (
                          <td className="cell yes" key={r.id}>
                            ✓<span className="visually-hidden">Allowed</span>
                          </td>
                        ) : (
                          <td className="cell no" key={r.id}>
                            –<span className="visually-hidden">Not allowed</span>
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
