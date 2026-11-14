import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listIssuesForStaff } from '@/server/services/messenger';
import { visibilityLabel } from '../_components/audience-picker';
import { ModuleGate } from '../announcements/shared';

export const metadata = { title: 'School Messenger' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ deleted?: string }> };

export default async function MessengerAdmin({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'announcements.view')) notFound();
  const base = await tenantBase(key);
  const a = `${base}/admin/messenger`;
  const rows = await listIssuesForStaff(ctx);
  const canCreate = !ctx.support && hasAnywhere(ctx, 'announcements.create');
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="messenger" name="School Messenger">
      <div className="admin-head">
        <div>
          <h1>School Messenger</h1>
          <p>The archive of past newsletters. Each issue is shown as it was emailed, in a frame that cannot run scripts.</p>
        </div>
        {canCreate && (
          <div className="btn-row">
            <Link className="btn btn-quiet btn-sm" href={`${a}/import`}>
              Import from file
            </Link>
            <Link className="btn btn-primary btn-sm" href={`${a}/new`}>
              Add issue
            </Link>
          </div>
        )}
      </div>
      {(await searchParams).deleted && <div className="notice notice-ok">Issue deleted.</div>}
      <section className="panel" aria-label="Issues">
        {rows.length === 0 ? (
          <div className="panel-body">
            <p>No issues yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Title</th>
                  <th scope="col">Who can see it</th>
                  <th scope="col">Shown</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{r.issueDate}</td>
                    <td className="cell-title">
                      <Link href={`${a}/${r.id}`}>{r.title}</Link>
                    </td>
                    <td className="muted">{visibilityLabel(r.visibility)}</td>
                    <td>{r.isActive ? 'Yes' : 'Hidden'}</td>
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
