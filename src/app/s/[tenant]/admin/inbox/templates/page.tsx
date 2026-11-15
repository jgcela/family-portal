import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { listTemplates } from '@/server/services/inbox';
import { ConfirmButton } from '../../staff/forms';
import { deleteTemplateAction, saveTemplateAction } from '../../_ops/actions';
import { OpsForm } from '../../_ops/forms';

export const metadata = { title: 'Reply templates' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { ctx } = await requireStaff(key);
  const rows = await listTemplates(ctx).catch(() => null);
  if (!rows) notFound();
  const a = `${await tenantBase(key)}/admin`;
  const canEdit = can(ctx, 'inbox.manage') && !ctx.support;
  return (
    <>
      <p>
        <Link href={`${a}/inbox`}>← Inbox</Link>
      </p>
      <div className="admin-head">
        <div>
          <h1>Reply templates</h1>
          <p>Answers the office sends often. Pick one when replying and adjust it before sending.</p>
        </div>
      </div>
      {rows.map((t) => (
        <section className="panel" key={t.id}>
          <div className="panel-body">
            {canEdit ? (
              <>
                <OpsForm action={saveTemplateAction.bind(null, key, t.id)} submit="Save">
                  <div className="field">
                    <label htmlFor={`t-${t.id}`}>Title</label>
                    <input id={`t-${t.id}`} name="title" defaultValue={t.title} maxLength={80} required />
                  </div>
                  <div className="field">
                    <label htmlFor={`b-${t.id}`}>Text</label>
                    <textarea id={`b-${t.id}`} name="body" defaultValue={t.body} maxLength={4000} required />
                  </div>
                </OpsForm>
                <ConfirmButton run={deleteTemplateAction.bind(null, key, t.id)} label="Delete" confirmLabel="Delete template" danger />
              </>
            ) : (
              <>
                <strong>{t.title}</strong>
                <p style={{ whiteSpace: 'pre-line' }}>{t.body}</p>
              </>
            )}
          </div>
        </section>
      ))}
      {canEdit && (
        <section className="panel">
          <div className="panel-head">
            <h2>New template</h2>
          </div>
          <div className="panel-body">
            <OpsForm action={saveTemplateAction.bind(null, key, null)} submit="Add template" resetOnOk>
              <div className="field">
                <label htmlFor="new-title">Title</label>
                <input id="new-title" name="title" maxLength={80} required placeholder="e.g. Absence received" />
              </div>
              <div className="field">
                <label htmlFor="new-body">Text</label>
                <textarea id="new-body" name="body" maxLength={4000} required />
              </div>
            </OpsForm>
          </div>
        </section>
      )}
    </>
  );
}
