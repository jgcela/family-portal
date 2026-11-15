import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getModuleState } from '@/server/services/modules';
import { listWorkflows, TEMPLATES } from '@/server/services/workflows';
import { createWorkflowAction } from '../_ops/actions';
import { TemplateButton } from './forms';

export const metadata = { title: 'Workflows' };
export const dynamic = 'force-dynamic';

const TRIGGER: Record<string, string> = { attendance_notice: 'Attendance notices', family_question: 'Questions sent to the office', office_request: 'Requests from families' };

export default async function WorkflowsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!can(ctx, 'workflows.manage') || ctx.support) notFound();
  const st = await getModuleState(tenant.id);
  const a = `${await tenantBase(key)}/admin`;
  const active = st.active.some((m) => m.id === 'workflows');
  const rows = await listWorkflows(ctx);
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Workflows</h1>
          <p>
            Rules that decide who handles each new request, how soon it is due, when it escalates, and which simple attendance notices are accepted without anyone
            acting. Rules come from the templates below; for each type of request, the first enabled rule that matches is used.
          </p>
        </div>
      </div>
      {!active && (
        <div className="notice">
          Workflows are not part of this school&apos;s plan or are switched off in Modules. Without rules, every request arrives in the inbox unassigned and due in 24
          hours.
        </div>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>Your rules</h2>
        </div>
        {rows.length === 0 ? (
          <p className="panel-body muted">No rules yet. Start from a template.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Applies to</th>
                  <th scope="col">Order</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td className="cell-title">
                      <Link href={`${a}/workflows/${w.id}`}>{w.name}</Link>
                    </td>
                    <td>{TRIGGER[w.trigger]}</td>
                    <td>{w.sortOrder}</td>
                    <td>{w.enabled ? <span className="status status-published">On</span> : <span className="status status-draft">Off</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Templates</h2>
        </div>
        <ul className="panel-body template-list">
          {TEMPLATES.map((t) => (
            <li key={t.key}>
              <div>
                <strong>{t.name}</strong>
                <p className="muted">{t.description}</p>
              </div>
              {t.available ? (
                active ? <TemplateButton action={createWorkflowAction.bind(null, key, t.key)} label="Use template" /> : null
              ) : (
                <span className="status status-archived">Coming later</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
