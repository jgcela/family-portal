import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/errors';
import { getIssueForStaff } from '@/server/services/messenger';
import { ModuleGate } from '../../announcements/shared';
import { DeleteWithConfirm } from '../../_components/workflow';
import { EditIssueForm } from '../forms';
import { deleteIssueAction } from '../actions';

export const metadata = { title: 'Edit issue' };

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditIssue({ params, searchParams }: Props) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const base = await tenantBase(key);
  let row;
  try {
    row = await getIssueForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const canEdit = !ctx.support && hasAnywhere(ctx, 'announcements.edit');
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="messenger" name="School Messenger">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/messenger`}>← School Messenger</Link>
          </p>
          <h1>{row.title}</h1>
          <p>
            {row.issueDate} · <Link href={`${base}/messenger/${row.id}`}>View on portal</Link>
          </p>
        </div>
      </div>
      {(await searchParams).saved && <div className="notice notice-ok">Saved.</div>}
      <section className="panel">
        <div className="panel-body">
          {canEdit ? (
            <EditIssueForm
              tenantKey={key}
              id={row.id}
              defaults={{ title: row.title, excerpt: row.excerpt ?? '', highlights: row.highlights, visibility: row.visibility, isActive: row.isActive }}
            />
          ) : (
            <p className="muted">You can view this issue but not edit it.</p>
          )}
          <p className="hint">To change the newsletter itself, add it again with the same date from &ldquo;Add issue&rdquo;.</p>
        </div>
      </section>
      {!ctx.support && hasAnywhere(ctx, 'announcements.delete') && (
        <section className="panel">
          <div className="panel-body">
            <DeleteWithConfirm title={row.title} noun="issue" run={deleteIssueAction.bind(null, key, row.id)} />
          </div>
        </section>
      )}
    </ModuleGate>
  );
}
