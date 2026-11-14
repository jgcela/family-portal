import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { ModuleGate } from '../../announcements/shared';
import { ImportIssuesForm } from '../forms';

export const metadata = { title: 'Import issues' };

export default async function ImportIssues({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !hasAnywhere(ctx, 'announcements.create')) notFound();
  const base = await tenantBase(key);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="messenger" name="School Messenger">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/messenger`}>← School Messenger</Link>
          </p>
          <h1>Import issues</h1>
          <p>
            Load an archive of past newsletters from a <code>.json</code> file, for example one prepared when moving from an old website.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <ImportIssuesForm tenantKey={key} />
        </div>
      </section>
    </ModuleGate>
  );
}
