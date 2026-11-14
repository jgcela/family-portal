import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listVolunteerForStaff } from '@/server/services/volunteer';
import { visibilityLabel } from '../_components/audience-picker';
import { StatusBadge } from '../calendar/shared';
import { ModuleGate } from '../announcements/shared';

export const metadata = { title: 'Volunteer' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ deleted?: string }> };

export default async function VolunteerAdmin({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'volunteer.view')) notFound();
  const base = await tenantBase(key);
  const a = `${base}/admin/volunteer`;
  const sp = await searchParams;
  const rows = await listVolunteerForStaff(ctx);
  const canCreate = hasAnywhere(ctx, 'volunteer.create') && !ctx.support;
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="volunteer" name="Volunteer">
      <div className="admin-head">
        <div>
          <h1>Volunteer</h1>
          <p>Ways for families to help, with sign-up links. Opportunities are for signed-in families unless you choose otherwise, because they often list volunteers&rsquo; personal emails and phones.</p>
        </div>
        {canCreate && (
          <div className="btn-row">
            <Link className="btn btn-quiet btn-sm" href={`${a}/import`}>
              Import from file
            </Link>
            <Link className="btn btn-primary btn-sm" href={`${a}/new`}>
              New opportunity
            </Link>
          </div>
        )}
      </div>
      {sp.deleted && <div className="notice notice-ok">Opportunity deleted.</div>}
      <section className="panel" aria-label="Opportunities">
        {rows.length === 0 ? (
          <div className="panel-body">
            <p>No opportunities yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Opportunity</th>
                  <th scope="col">Type</th>
                  <th scope="col">Who can see it</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title">
                      <Link href={`${a}/${r.id}`}>{r.title}</Link>
                      {r.schedule && <div className="muted">{r.schedule}</div>}
                    </td>
                    <td className="muted">{r.category ?? '—'}</td>
                    <td className="muted">{visibilityLabel(r.visibility)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ModuleGate>
  );
}
