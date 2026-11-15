import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getWorkflow } from '@/server/services/workflows';
import { assignableStaff } from '@/server/services/inbox';
import { withTenant } from '@/server/db/client';
import { grades } from '@/server/db/schema';
import { ConfirmButton } from '../../staff/forms';
import { deleteWorkflowAction, saveWorkflowAction } from '../../_ops/actions';
import { OpsForm } from '../../_ops/forms';

export const metadata = { title: 'Workflow rule' };
export const dynamic = 'force-dynamic';

export default async function WorkflowPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  if (!can(ctx, 'workflows.manage') || ctx.support) notFound();
  const w = await getWorkflow(ctx, id).catch(() => null);
  if (!w) notFound();
  const a = `${await tenantBase(key)}/admin`;
  const [staff, gradeRows] = await Promise.all([
    assignableStaff(ctx),
    withTenant(tenant.id, (tx) => tx.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sortOrder))),
  ]);
  const c = w.parsed;
  const isAttendance = w.trigger === 'attendance_notice';
  const staffOptions = (
    <>
      <option value="">Nobody</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </>
  );
  return (
    <>
      <p>
        <Link href={`${a}/workflows`}>← Workflows</Link>
      </p>
      <div className="admin-head">
        <h1>{w.name}</h1>
      </div>
      <section className="panel">
        <div className="panel-body">
          <OpsForm action={saveWorkflowAction.bind(null, key, w.id)} submit="Save rule">
            <div className="form-row">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" defaultValue={w.name} maxLength={100} required />
              </div>
              <div className="field">
                <label htmlFor="sortOrder">Order</label>
                <input id="sortOrder" name="sortOrder" type="number" min={0} max={1000} defaultValue={w.sortOrder} />
                <span className="hint">Lower numbers are checked first.</span>
              </div>
            </div>
            <label className="check">
              <input type="checkbox" name="enabled" defaultChecked={w.enabled} /> Rule is on
            </label>

            {isAttendance && (
              <fieldset className="field">
                <legend>Only when (leave empty for all)</legend>
                <div className="check-grid">
                  {[
                    ['absent', 'Absent'],
                    ['late', 'Late arrival'],
                    ['early_dismissal', 'Early dismissal'],
                  ].map(([v, l]) => (
                    <label className="check" key={v}>
                      <input type="checkbox" name="types" value={v} defaultChecked={c.match.types.includes(v as never)} /> {l}
                    </label>
                  ))}
                </div>
                <div className="check-grid">
                  {[
                    ['illness', 'Illness'],
                    ['medical_appointment', 'Medical appointment'],
                    ['family', 'Family reason'],
                    ['other', 'Other'],
                  ].map(([v, l]) => (
                    <label className="check" key={v}>
                      <input type="checkbox" name="reasons" value={v} defaultChecked={c.match.reasons.includes(v as never)} /> {l}
                    </label>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="maxDays">Covering at most this many days</label>
                  <input id="maxDays" name="maxDays" type="number" min={1} max={30} defaultValue={c.match.maxDays ?? ''} />
                </div>
              </fieldset>
            )}
            <fieldset className="field">
              <legend>Grades (leave empty for all)</legend>
              <div className="check-grid">
                {gradeRows.map((g) => (
                  <label className="check" key={g.id}>
                    <input type="checkbox" name="gradeIds" value={g.id} defaultChecked={c.match.gradeIds.includes(g.id)} /> {g.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="action">What happens</label>
              <select id="action" name="action" defaultValue={c.action}>
                <option value="route">Send to the inbox for someone to handle</option>
                {isAttendance && <option value="auto_accept">Accept automatically (nobody needs to act)</option>}
              </select>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="assigneeUserId">Owner</label>
                <select id="assigneeUserId" name="assigneeUserId" defaultValue={c.assigneeUserId ?? ''}>
                  {staffOptions}
                </select>
              </div>
              <div className="field">
                <label htmlFor="priority">Priority</label>
                <select id="priority" name="priority" defaultValue={c.priority}>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="dueInHours">Due within (hours)</label>
                <input id="dueInHours" name="dueInHours" type="number" min={1} max={336} defaultValue={c.dueInHours} required />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="escalateAfterHours">Escalate if still open after (hours)</label>
                <input id="escalateAfterHours" name="escalateAfterHours" type="number" min={1} max={336} defaultValue={c.escalateAfterHours ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="escalateToUserId">Escalate to</label>
                <select id="escalateToUserId" name="escalateToUserId" defaultValue={c.escalateToUserId ?? ''}>
                  {staffOptions}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="familyMessage">Message on the family&apos;s receipt (optional)</label>
              <textarea id="familyMessage" name="familyMessage" defaultValue={c.familyMessage} maxLength={500} rows={2} />
            </div>
            <p className="hint">
              Escalations are checked when staff open the inbox and once a day. Each rule that runs counts toward the plan&apos;s monthly automation allowance; when it
              runs out, requests still arrive in the inbox with the default settings.
            </p>
          </OpsForm>
          <ConfirmButton run={deleteWorkflowAction.bind(null, key, w.id)} label="Delete rule" confirmLabel="Delete" danger />
        </div>
      </section>
    </>
  );
}
