import { desc, eq } from 'drizzle-orm';
import { withTenant } from '@/server/db/client';
import { auditLogs, plans, roles, subscriptions } from '@/server/db/schema';
import { can } from '@/server/rbac/authorize';
import { getModuleState } from '@/server/services/modules';
import { requireStaff } from '@/server/request';

export const metadata = { title: 'Dashboard' };

type Props = { params: Promise<{ tenant: string }> };

export default async function AdminHome({ params }: Props) {
  const { tenant, ctx, user } = await requireStaff((await params).tenant);
  const [modules, data] = await Promise.all([
    getModuleState(tenant.id),
    withTenant(tenant.id, async (tx) => {
      const [sub] = await tx
        .select({ plan: plans.name, status: subscriptions.status, renewsAt: subscriptions.renewsAt })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId));
      const roleRows = await tx.select({ id: roles.id, name: roles.name }).from(roles);
      const activity = can(ctx, 'audit.view')
        ? await tx.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10)
        : [];
      return { sub, roleRows, activity };
    }),
  ]);
  const roleNames = new Map(data.roleRows.map((r) => [r.id, r.name]));
  const myRoles = [...new Set(ctx.grants.map((g) => `${roleNames.get(g.roleId)}${g.scopeType === 'school' ? '' : ` (${g.scopeType})`}`))];

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Good to see you, {user.name.split(' ')[0]}</h1>
          <p>
            Signed in as {myRoles.join(', ') || 'a staff member'} at {tenant.name}.
          </p>
        </div>
      </div>
      <dl className="stat-grid">
        <div className="stat">
          <dt>Plan</dt>
          <dd>{data.sub?.plan ?? 'None'}</dd>
        </div>
        <div className="stat">
          <dt>Subscription</dt>
          <dd style={{ textTransform: 'capitalize' }}>{data.sub?.status.replace('_', ' ') ?? '—'}</dd>
        </div>
        <div className="stat">
          <dt>Active modules</dt>
          <dd>{modules.active.length}</dd>
        </div>
        <div className="stat">
          <dt>Timezone</dt>
          <dd style={{ fontSize: '1rem' }}>{tenant.timezone}</dd>
        </div>
      </dl>
      {can(ctx, 'audit.view') && (
        <section className="panel" aria-labelledby="activity">
          <div className="panel-head">
            <h2 id="activity">Recent activity</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.createdAt.toLocaleString('en-US', { timeZone: tenant.timezone, dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td>{a.action}</td>
                    <td className="muted">{a.targetType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
