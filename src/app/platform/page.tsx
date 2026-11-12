import { asc, eq } from 'drizzle-orm';
import { platformDb } from '@/server/db/client';
import { plans, subscriptions, tenantDomains, tenants } from '@/server/db/schema';
import { requirePlatformAdmin } from '@/server/request';
import '../s/[tenant]/admin/admin.css';

export const metadata = { title: 'Platform · Schools' };

export default async function PlatformSchools() {
  const { user, role } = await requirePlatformAdmin();
  const rows = await platformDb()
    .select({ t: tenants, plan: plans.name, sub: subscriptions.status, host: tenantDomains.hostname })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .leftJoin(tenantDomains, eq(tenantDomains.tenantId, tenants.id))
    .orderBy(asc(tenants.name));
  return (
    <main id="main" className="admin-main" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="admin-head">
        <div>
          <h1>Schools</h1>
          <p>
            Platform owner view ({role}) · {user.email}. School content is not visible here; support access needs a
            time-limited grant approved by the school.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">School</th>
                <th scope="col">Slug</th>
                <th scope="col">Status</th>
                <th scope="col">Plan</th>
                <th scope="col">Subscription</th>
                <th scope="col">Portal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.t.id + (r.host ?? '')}>
                  <th scope="row">{r.t.name}</th>
                  <td>{r.t.slug}</td>
                  <td>
                    <span className={`badge ${r.t.status === 'active' ? 'badge-on' : ''}`}>{r.t.status}</span>
                  </td>
                  <td>{r.plan ?? '—'}</td>
                  <td>{r.sub ?? '—'}</td>
                  <td>
                    <a href={`/s/${r.t.slug}`}>Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
