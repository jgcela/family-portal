import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { assignableStaff, getInboxItem, listTemplates } from '@/server/services/inbox';
import { REASON_LABEL, STATUS_LABEL, TRANSITIONS, TYPE_LABEL } from '@/server/services/attendance';
import { ValidationError } from '@/server/errors';
import { AuthorizationError } from '@/server/rbac/authorize';
import { commentAction, reviewAction, updateItemAction } from '../../_ops/actions';
import { CommentForm, OpsForm } from '../../_ops/forms';
import { ITEM_STATUS } from '../../_ops/labels';

export const metadata = { title: 'Request' };
export const dynamic = 'force-dynamic';

const EVENT: Record<string, string> = {
  created: 'Created',
  status: 'Status',
  assigned: 'Owner',
  priority: 'Priority',
  note: 'Internal note',
  reply: 'Message',
  escalated: 'Escalated',
  automation: 'Rule',
};

export default async function InboxItemPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const d = await getInboxItem(ctx, id).catch((err) => {
    if (err instanceof ValidationError || err instanceof AuthorizationError) return null;
    throw err;
  });
  if (!d) notFound();
  const a = `${await tenantBase(key)}/admin`;
  const [staff, templates] = await Promise.all([assignableStaff(ctx), listTemplates(ctx)]);
  const name = new Map(staff.map((s) => [s.id, s.name]));
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: tenant.timezone });
  const { item, notice } = d;
  const open = ['new', 'in_progress', 'waiting'].includes(item.status);
  const label = (kind: string, v: string | null) =>
    !v ? 'nobody' : kind === 'assigned' ? name.get(v) ?? 'a former staff member' : kind === 'status' ? STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? ITEM_STATUS[v] ?? v : v;
  const next = notice ? TRANSITIONS[notice.status] : [];

  return (
    <>
      <p>
        <Link href={`${a}/inbox`}>← Inbox</Link>
      </p>
      <div className="admin-head">
        <div>
          <h1>
            R-{item.number} · {item.subject}
          </h1>
          <p>
            {ITEM_STATUS[item.status]}
            {item.dueAt && open ? ` · due ${fmt.format(item.dueAt)}` : ''}
            {d.assignee ? ` · owner ${d.assignee}` : ' · unassigned'}
            {item.escalatedAt ? ' · escalated' : ''}
          </p>
        </div>
      </div>

      <div className="split">
        <div>
          <section className="panel">
            <div className="panel-head">
              <h2>Details</h2>
            </div>
            <div className="panel-body">
              <dl className="facts">
                <dt>From</dt>
                <dd>{d.requester ? `${d.requester.name} (${d.requester.email})` : 'Staff'}</dd>
                {d.student && (
                  <>
                    <dt>Student</dt>
                    <dd>
                      {d.student.id ? <Link href={`${a}/students/${d.student.id}`}>{d.student.name}</Link> : d.student.name}
                      {d.student.externalId ? ` · SIS id ${d.student.externalId}` : ''}
                    </dd>
                  </>
                )}
                {d.grade && (
                  <>
                    <dt>Grade</dt>
                    <dd>{d.grade}</dd>
                  </>
                )}
                <dt>Received</dt>
                <dd>{fmt.format(item.createdAt)}</dd>
                {notice ? (
                  <>
                    <dt>Notice</dt>
                    <dd>
                      {TYPE_LABEL[notice.type]} · {notice.dateFrom === notice.dateTo ? notice.dateFrom : `${notice.dateFrom} to ${notice.dateTo}`}
                      {notice.time ? ` at ${notice.time}` : ''}
                    </dd>
                    <dt>Reason</dt>
                    <dd>{REASON_LABEL[notice.reason]}</dd>
                    {notice.comment && (
                      <>
                        <dt>Comment</dt>
                        <dd>{notice.comment}</dd>
                      </>
                    )}
                    <dt>Notice status</dt>
                    <dd>
                      {STATUS_LABEL[notice.status]}
                      {notice.sisRecordedManuallyAt ? ` · entered in the SIS by hand on ${fmt.format(notice.sisRecordedManuallyAt)}` : ''}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt>Message</dt>
                    <dd style={{ whiteSpace: 'pre-line' }}>{item.body}</dd>
                  </>
                )}
              </dl>
            </div>
          </section>

          {notice && d.canReviewAttendance && (next.length > 0 || (notice.status === 'approved' && !notice.sisRecordedManuallyAt)) && (
            <section className="panel">
              <div className="panel-head">
                <h2>Attendance decision</h2>
              </div>
              <div className="panel-body">
                <OpsForm action={reviewAction.bind(null, key, item.id, notice.id)} className="form">
                  <div className="field">
                    <label htmlFor="note">Message to the family (required to decline)</label>
                    <textarea id="note" name="note" rows={2} maxLength={500} />
                  </div>
                  <div className="btn-row">
                    {next.includes('pending_review') && (
                      <button className="btn btn-quiet btn-sm" name="op" value="start">
                        Mark as being reviewed
                      </button>
                    )}
                    {next.includes('approved') && (
                      <button className="btn btn-primary btn-sm" name="op" value="approve">
                        Accept
                      </button>
                    )}
                    {next.includes('rejected') && (
                      <button className="btn btn-quiet btn-sm" name="op" value="reject">
                        Decline
                      </button>
                    )}
                    {notice.status === 'approved' && !notice.sisRecordedManuallyAt && (
                      <button className="btn btn-quiet btn-sm" name="op" value="sis">
                        I entered it in the SIS
                      </button>
                    )}
                    {next.includes('cancelled') && (
                      <button className="btn btn-quiet btn-sm" name="op" value="cancel">
                        Cancel notice
                      </button>
                    )}
                  </div>
                  <p className="hint">There is no SIS connection yet: after accepting, enter the absence in your SIS as usual and mark it here.</p>
                </OpsForm>
              </div>
            </section>
          )}

          {d.canManage && (
            <section className="panel">
              <div className="panel-head">
                <h2>Reply or add a note</h2>
              </div>
              <div className="panel-body">
                <CommentForm action={commentAction.bind(null, key, item.id)} templates={templates} canReply={!!item.requesterUserId} />
                <p className="hint">Families see replies on their request page in the portal. Email notifications are not set up yet.</p>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2>History</h2>
            </div>
            <ol className="timeline panel-body">
              {d.events.map((e) => (
                <li key={e.id}>
                  <time>{fmt.format(e.createdAt)}</time> <strong>{EVENT[e.kind]}</strong>
                  {e.actor ? ` · ${e.actor}` : e.actorKind === 'system' ? ' · automatic' : ''}
                  {e.visibleToFamily ? '' : ' · staff only'}
                  {(e.kind === 'status' || e.kind === 'assigned' || e.kind === 'priority') && (
                    <div>
                      {label(e.kind, e.fromValue)} → {label(e.kind, e.toValue)}
                    </div>
                  )}
                  {e.body && <div style={{ whiteSpace: 'pre-line' }}>{e.body}</div>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {d.canManage && (
          <aside className="panel">
            <div className="panel-head">
              <h2>Manage</h2>
            </div>
            <div className="panel-body">
              <OpsForm action={updateItemAction.bind(null, key, item.id)} submit="Save" className="form">
                <div className="field">
                  <label htmlFor="assigneeUserId">Owner</label>
                  <select id="assigneeUserId" name="assigneeUserId" defaultValue={item.assigneeUserId ?? ''}>
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.id === ctx.userId ? ' (me)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="status">Status</label>
                  <select id="status" name="status" defaultValue={item.status}>
                    {Object.entries(ITEM_STATUS)
                      .filter(([k]) => item.kind !== 'attendance' || !['resolved', 'cancelled'].includes(k) || k === item.status)
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </select>
                  {item.kind === 'attendance' && <span className="hint">Attendance requests close when you accept or decline the notice.</span>}
                </div>
                <div className="field">
                  <label htmlFor="priority">Priority</label>
                  <select id="priority" name="priority" defaultValue={item.priority}>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </OpsForm>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
