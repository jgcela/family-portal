import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listPagesForStaff } from '@/server/services/content';
import { StatusBadge } from '../calendar/shared';
import { formatInstant, ModuleGate } from '../announcements/shared';

export const metadata = { title: 'School pages' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ deleted?: string }> };

export default async function PagesAdmin({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'pages.view')) notFound();
  const base = await tenantBase(key);
  const rows = await listPagesForStaff(ctx);
  const sp = await searchParams;
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="pages" name="School Pages">
      <div className="admin-head">
        <div>
          <h1>School pages</h1>
          <p>Longer content such as the parent handbook, supply lists or policies. Each publish keeps a version you can go back to.</p>
        </div>
        {hasAnywhere(ctx, 'pages.create') && (
          <Link className="btn btn-primary btn-sm" href={`${base}/admin/pages/new`}>
            New page
          </Link>
        )}
      </div>
      {sp.deleted && <div className="notice notice-ok">Page deleted.</div>}
      <section className="panel" aria-label="Pages">
        {rows.length === 0 ? (
          <div className="panel-body">
            <p>No pages yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Address</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title">
                      <Link href={`${base}/admin/pages/${r.id}`}>{r.title}</Link>
                    </td>
                    <td className="muted">/p/{r.slug}</td>
                    <td className="nowrap">{formatInstant(r.updatedAt, tenant.timezone)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.publishedVersionId && r.status !== 'published' && <div className="muted">Live version online</div>}
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
