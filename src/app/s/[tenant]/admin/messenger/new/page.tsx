import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { ModuleGate } from '../../announcements/shared';
import { AddIssueForm } from '../forms';

export const metadata = { title: 'Add issue' };

export default async function NewIssue({ params }: { params: Promise<{ tenant: string }> }) {
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
          <h1>Add issue</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <AddIssueForm tenantKey={key} />
        </div>
      </section>
    </ModuleGate>
  );
}
