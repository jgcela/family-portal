import { desc, eq } from 'drizzle-orm';
import { withTenant } from '@/server/db/client';
import { auditLogs, plans, roles, subscriptions } from '@/server/db/schema';
import { can, hasAnywhere } from '@/server/rbac/authorize';
import { Icon } from '@/app/_shell/icons';
import { getModuleState } from '@/server/services/modules';
import { requireStaff, tenantBase } from '@/server/request';
import { countPendingSupportRequests } from '@/server/services/support';
import Link from 'next/link';

export const metadata = { title: 'Dashboard' };

type Props = { params: Promise<{ tenant: string }> };

export default async function AdminHome({ params }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx, user } = await requireStaff(key);
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
  const myRoles = ctx.support
    ? ['platform support (read-only)']
    : [...new Set(ctx.grants.map((g) => `${roleNames.get(g.roleId)}${g.scopeType === 'school' ? '' : ` (${g.scopeType})`}`))];
  const pendingSupport = !ctx.support && can(ctx, 'support.grant') ? await countPendingSupportRequests(tenant.id) : 0;

  const a = `${await tenantBase(key)}/admin`;
  const subStatus = data.sub?.status;
  const shortcuts = [
    { href: `${a}/announcements/new`, label: 'Write an announcement', icon: 'megaphone' as const, show: hasAnywhere(ctx, 'announcements.create') },
    { href: `${a}/calendar/new`, label: 'Add an event', icon: 'calendar' as const, show: hasAnywhere(ctx, 'events.create') },
    { href: `${a}/documents/new`, label: 'Upload a document', icon: 'document' as const, show: hasAnywhere(ctx, 'documents.create') && hasAnywhere(ctx, 'documents.upload') },
    { href: `${a}/families`, label: 'Review families', icon: 'users' as const, show: hasAnywhere(ctx, 'users.view') },
  ].filter((s) => s.show && !ctx.support);

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
          <span className="stat-icon" aria-hidden="true">
            <Icon name="plan" size={22} />
          </span>
        </div>
        <div className="stat">
          <dt>Subscription</dt>
          <dd style={{ textTransform: 'capitalize' }}>{subStatus?.replace('_', ' ') ?? '—'}</dd>
          <span className="stat-icon" aria-hidden="true">
            <Icon name="check" size={22} />
          </span>
        </div>
        <div className="stat">
          <dt>Active modules</dt>
          <dd>{modules.active.length}</dd>
          <span className="stat-icon" aria-hidden="true">
            <Icon name="modules" size={22} />
          </span>
        </div>
        <div className="stat">
          <dt>Timezone</dt>
          <dd style={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>{tenant.timezone}</dd>
          <span className="stat-icon" aria-hidden="true">
            <Icon name="clock" size={22} />
          </span>
        </div>
      </dl>
      <div className="dash-grid">
        <div>
          <section className="panel" aria-labelledby="attention">
            <div className="panel-head">
              <h2 id="attention">Needs your attention</h2>
            </div>
            <div className="panel-body">
              <ul className="insights">
                {pendingSupport > 0 && (
                  <li className="insight insight-warn" role="status">
                    <Icon name="alert" />
                    <span>
                      The platform team asked to look at your dashboard. <Link href={`${a}/support`}>Review the request</Link>
                    </span>
                  </li>
                )}
                {subStatus && subStatus !== 'active' && (
                  <li className="insight insight-warn">
                    <Icon name="alert" />
                    <span>
                      Your subscription is {subStatus.replace('_', ' ')}. Contact the platform team if this looks wrong.
                    </span>
                  </li>
                )}
                {pendingSupport === 0 && (!subStatus || subStatus === 'active') && (
                  <li className="insight insight-ok">
                    <Icon name="check" />
                    <span>Nothing needs your attention right now.</span>
                  </li>
                )}
              </ul>
            </div>
          </section>
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
                        <td className="nowrap">
                          {a.createdAt.toLocaleString('en-US', { timeZone: tenant.timezone, dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td>{a.action}</td>
                        <td>{a.targetType && <span className="status status-draft">{a.targetType}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
        <aside aria-label="Your school">
          {shortcuts.length > 0 && (
            <section className="panel" aria-labelledby="shortcuts">
              <div className="panel-head">
                <h2 id="shortcuts">Shortcuts</h2>
              </div>
              <div className="panel-body">
                <ul className="shortcuts">
                  {shortcuts.map((s) => (
                    <li key={s.href}>
                      <Link href={s.href}>
                        <span className="shortcut-icon" aria-hidden="true">
                          <Icon name={s.icon} />
                        </span>
                        {s.label}
                        <Icon name="arrow" size={18} className="shortcut-arrow" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          <section className="panel" aria-labelledby="school">
            <div className="panel-head">
              <h2 id="school">Your school</h2>
            </div>
            <div className="panel-body">
              <dl className="side-list">
                <div>
                  <dt>School</dt>
                  <dd>{tenant.name}</dd>
                </div>
                <div>
                  <dt>Your roles</dt>
                  <dd>{myRoles.join(', ') || 'Staff member'}</dd>
                </div>
                <div>
                  <dt>Family portal</dt>
                  <dd>
                    <Link href={(await tenantBase(key)) || '/'}>Open the portal families see</Link>
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
