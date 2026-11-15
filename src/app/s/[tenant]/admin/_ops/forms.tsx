'use client';
import { useActionState, useRef, useState } from 'react';
import type { OpsResult } from './actions';
import { ITEM_STATUS } from './labels';

export function Msg({ state }: { state: OpsResult }) {
  if (state?.error)
    return (
      <div className="notice notice-error" role="alert">
        {state.error}
      </div>
    );
  if (state?.ok)
    return (
      <div className="notice notice-ok" role="status">
        {state.ok}
      </div>
    );
  return null;
}

/** A form bound to one server action, with its result shown above the fields. */
export function OpsForm({
  action,
  children,
  submit,
  className = 'form',
  resetOnOk = false,
}: {
  action: (p: OpsResult, fd: FormData) => Promise<OpsResult>;
  children: React.ReactNode;
  submit?: string;
  className?: string;
  resetOnOk?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState(async (p: OpsResult, fd: FormData) => {
    const r = await action(p, fd);
    if (r?.ok && resetOnOk) ref.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={ref} action={run} className={className}>
      <Msg state={state} />
      {children}
      {submit && (
        <div className="btn-row">
          <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
            {pending ? 'Saving…' : submit}
          </button>
        </div>
      )}
    </form>
  );
}

/** Reply / internal note with optional templates. */
export function CommentForm({ action, templates, canReply }: { action: (p: OpsResult, fd: FormData) => Promise<OpsResult>; templates: { id: string; title: string; body: string }[]; canReply: boolean }) {
  const [body, setBody] = useState('');
  const [mode, setMode] = useState(canReply ? 'reply' : 'note');
  const [state, run, pending] = useActionState(async (p: OpsResult, fd: FormData) => {
    const r = await action(p, fd);
    if (r?.ok) setBody('');
    return r;
  }, undefined);
  return (
    <form action={run} className="form">
      <Msg state={state} />
      <fieldset className="field">
        <legend className="visually-hidden">Type of message</legend>
        <div className="btn-row">
          {canReply && (
            <label className="check">
              <input type="radio" name="mode" value="reply" checked={mode === 'reply'} onChange={() => setMode('reply')} /> Reply to the family
            </label>
          )}
          <label className="check">
            <input type="radio" name="mode" value="note" checked={mode === 'note'} onChange={() => setMode('note')} /> Internal note (staff only)
          </label>
        </div>
      </fieldset>
      {templates.length > 0 && mode === 'reply' && (
        <div className="field">
          <label htmlFor="tpl">Start from a template</label>
          <select
            id="tpl"
            defaultValue=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) setBody(t.body);
            }}
          >
            <option value="">Choose…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="comment-body">{mode === 'reply' ? 'Reply' : 'Note'}</label>
        <textarea id="comment-body" name="body" rows={4} maxLength={4000} required value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {mode === 'reply' && (
        <label className="check">
          <input type="checkbox" name="wait" /> Waiting for the family to answer
        </label>
      )}
      <div className="btn-row">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {mode === 'reply' ? 'Send reply' : 'Add note'}
        </button>
      </div>
    </form>
  );
}

/** Inbox table with selection and bulk actions. */
export type InboxRow = {
  id: string;
  number: number;
  kind: string;
  subject: string;
  status: string;
  priority: string;
  student: string | null;
  grade: string | null;
  assignee: string | null;
  requester: string | null;
  due: string | null;
  overdue: boolean;
  automated: boolean;
  href: string;
};

const STATUS_CLASS: Record<string, string> = {
  new: 'status status-in_review',
  in_progress: 'status status-approved',
  waiting: 'status status-draft',
  resolved: 'status status-published',
  cancelled: 'status status-archived',
};

export function InboxTable({ rows, action, canManage, staff }: { rows: InboxRow[]; action: (p: OpsResult, fd: FormData) => Promise<OpsResult>; canManage: boolean; staff: { id: string; name: string }[] }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [all, setAll] = useState(false);
  return (
    <form action={run}>
      <Msg state={state} />
      {canManage && rows.length > 0 && (
        <div className="filters" aria-label="Bulk actions">
          <span className="muted">With selected:</span>
          <button className="btn btn-quiet btn-sm" name="op" value="mine" disabled={pending}>
            Assign to me
          </button>
          <div className="field">
            <label htmlFor="bulkAssignee" className="visually-hidden">
              Assign to
            </label>
            <select id="bulkAssignee" name="bulkAssignee" defaultValue="">
              <option value="">Nobody</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-quiet btn-sm" name="op" value="assign" disabled={pending}>
            Assign
          </button>
          <div className="field">
            <label htmlFor="bulkPriority" className="visually-hidden">
              Priority
            </label>
            <select id="bulkPriority" name="bulkPriority" defaultValue="normal">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button className="btn btn-quiet btn-sm" name="op" value="priority" disabled={pending}>
            Set priority
          </button>
          <button className="btn btn-quiet btn-sm" name="op" value="in_progress" disabled={pending}>
            In progress
          </button>
          <button className="btn btn-quiet btn-sm" name="op" value="resolved" disabled={pending}>
            Resolve
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="panel-body">
          <p className="muted">Nothing matches these filters.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {canManage && (
                  <th scope="col">
                    <input type="checkbox" aria-label="Select all" checked={all} onChange={(e) => setAll(e.target.checked)} />
                  </th>
                )}
                <th scope="col">Request</th>
                <th scope="col">Status</th>
                <th scope="col">Owner</th>
                <th scope="col">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {canManage && (
                    <td>
                      <input type="checkbox" name="ids" value={r.id} aria-label={`Select R-${r.number}`} {...(all ? { checked: true, readOnly: true } : {})} />
                    </td>
                  )}
                  <td className="cell-title">
                    <a href={r.href}>
                      R-{r.number} · {r.subject}
                    </a>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {[r.kind === 'attendance' ? 'Attendance' : r.kind === 'question' ? 'Question' : 'Request', r.grade, r.requester, r.priority !== 'normal' ? `Priority: ${r.priority}` : null, r.automated ? 'Handled by a rule' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td>
                    <span className={STATUS_CLASS[r.status]}>{ITEM_STATUS[r.status]}</span>
                  </td>
                  <td>{r.assignee ?? <span className="muted">Unassigned</span>}</td>
                  <td className={r.overdue ? 'field-error' : 'muted'}>{r.due ? `${r.overdue ? 'Overdue · ' : ''}${r.due}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  );
}
