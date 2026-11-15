'use client';
import { useActionState, useState } from 'react';
import { bulkStatusAction, deleteSourceAction, readLogAction, refreshAction, sandboxAskAction, saveSettingsAction, saveSourceAction } from './actions';
import { AnswerView } from '@/app/_ai/answer-view';
import { AudiencePicker } from '../_components/audience-picker';

type Result = { error?: string; ok?: string } | undefined;

function Msg({ state }: { state: Result }) {
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

export function RefreshButton({ tenantKey }: { tenantKey: string }) {
  const [state, action, pending] = useActionState(refreshAction.bind(null, tenantKey), undefined);
  return (
    <form action={action} className="inline-action">
      <button className="btn btn-quiet btn-sm" type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Check portal for changes'}
      </button>
      {state?.ok && <span className="muted" role="status">{state.ok}</span>}
      {state?.error && <span className="field-error" role="alert">{state.error}</span>}
    </form>
  );
}

export type SourceRow = {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  topicLabel: string;
  status: string;
  index: string;
  indexError: string | null;
  health: string;
  visibility: string;
  authoritative: boolean;
  editHref: string;
  openHref: string | null;
};

const STATUS: Record<string, [string, string]> = {
  approved: ['Approved', 'status status-published'],
  pending: ['Suggested', 'status status-in_review'],
  removed: ['Removed', 'status status-archived'],
};

export function SourcesTable({ tenantKey, rows, canEdit }: { tenantKey: string; rows: SourceRow[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(bulkStatusAction.bind(null, tenantKey), undefined);
  const [filter, setFilter] = useState<'active' | 'pending' | 'removed' | 'attention'>('active');
  const shown = rows.filter((r) =>
    filter === 'active'
      ? r.status !== 'removed'
      : filter === 'attention'
        ? r.status !== 'removed' && (r.health !== 'ok' || r.index === 'Failed' || r.index === 'Unsupported')
        : r.status === filter,
  );
  return (
    <form action={action}>
      <Msg state={state} />
      <div className="filters">
        <div className="field">
          <label htmlFor="src-filter">Show</label>
          <select id="src-filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="active">Approved and suggested</option>
            <option value="pending">Suggested (not used yet)</option>
            <option value="attention">Needs attention</option>
            <option value="removed">Removed</option>
          </select>
        </div>
        {canEdit && (
          <div className="btn-row">
            <button className="btn btn-primary btn-sm" name="op" value="approved" disabled={pending}>
              Approve selected
            </button>
            <button className="btn btn-quiet btn-sm" name="op" value="pending" disabled={pending}>
              Back to suggested
            </button>
            <button className="btn btn-danger btn-sm" name="op" value="removed" disabled={pending}>
              Remove selected
            </button>
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="panel-body">
          <p className="muted">Nothing here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {canEdit && <th scope="col"><span className="visually-hidden">Select</span></th>}
                <th scope="col">Source</th>
                <th scope="col">Topic</th>
                <th scope="col">Status</th>
                <th scope="col">Index</th>
                <th scope="col">Who can see it</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  {canEdit && (
                    <td>
                      <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.title}`} />
                    </td>
                  )}
                  <td className="cell-title">
                    <a href={r.editHref}>{r.title}</a>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {r.kindLabel}
                      {r.authoritative && ' · Authoritative'}
                      {r.health === 'stale' && ' · Not updated in over a year'}
                      {r.health === 'review_due' && ' · Review date passed'}
                      {r.openHref && (
                        <>
                          {' · '}
                          <a href={r.openHref}>Open</a>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="muted">{r.topicLabel}</td>
                  <td>
                    <span className={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] ?? r.status}</span>
                  </td>
                  <td className="muted" title={r.indexError ?? undefined}>
                    {r.index}
                    {r.indexError && (r.index === 'Failed' || r.index === 'Unsupported') && <div className="field-error" style={{ fontSize: '0.8rem' }}>{r.indexError}</div>}
                  </td>
                  <td className="muted">{r.visibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  );
}

export type SourceDefaults = {
  title: string;
  body: string;
  topic: string;
  visibility: string;
  audienceIds: string[];
  authoritative: boolean;
  effectiveDate: string;
  reviewBy: string;
  url: string;
};

export function SourceForm(p: {
  tenantKey: string;
  id: string | null;
  kind: 'faq' | 'text' | null;
  own: boolean;
  defaults: SourceDefaults;
  topics: readonly (readonly [string, string])[];
  audiences: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveSourceAction.bind(null, p.tenantKey, p.id, p.kind), undefined);
  const d = p.defaults;
  const faq = p.kind === 'faq';
  return (
    <form action={action} className="form">
      <Msg state={state} />
      {p.own && (
        <>
          <div className="field">
            <label htmlFor="title">{faq ? 'Question' : 'Title'}</label>
            <input id="title" name="title" required maxLength={200} defaultValue={d.title} placeholder={faq ? 'e.g. What time does the car line open?' : 'e.g. Lunch program 2026–27'} />
          </div>
          <div className="field">
            <label htmlFor="body">{faq ? 'Approved answer' : 'Text'}</label>
            <textarea id="body" name="body" required rows={faq ? 5 : 14} maxLength={200000} defaultValue={d.body} />
            <span className="hint">
              {faq
                ? 'Write the answer the school stands behind. The assistant quotes it word for word as the source.'
                : 'Paste plain text or HTML (for example from a web page). Formatting is removed; headings become sections.'}
            </span>
          </div>
          <div className="field">
            <label htmlFor="url">Link to show with answers (optional)</label>
            <input id="url" name="url" maxLength={500} defaultValue={d.url} placeholder="/p/handbook or https://…" />
          </div>
          <AudiencePicker audiences={p.audiences} selected={d.audienceIds} visibility={d.visibility} />
        </>
      )}
      <div className="form-row">
        <div className="field">
          <label htmlFor="topic">Topic</label>
          <select id="topic" name="topic" defaultValue={d.topic}>
            {p.topics.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className="hint">Used for reports and to pick the escalation contact.</span>
        </div>
        <div className="field">
          <label htmlFor="effectiveDate">Effective date (optional)</label>
          <input id="effectiveDate" name="effectiveDate" type="date" defaultValue={d.effectiveDate} />
        </div>
        <div className="field">
          <label htmlFor="reviewBy">Review by (optional)</label>
          <input id="reviewBy" name="reviewBy" type="date" defaultValue={d.reviewBy} />
          <span className="hint">After this date the source is flagged for review.</span>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" name="authoritative" defaultChecked={d.authoritative} />
        <span>
          <strong>Authoritative</strong> <span className="muted">When sources disagree, this one wins.</span>
        </span>
      </label>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {p.id ? 'Save changes' : 'Add source'}
        </button>
        {!p.id && <span className="muted">It starts as suggested. Approve it on the list to let the assistant use it.</span>}
      </div>
    </form>
  );
}

export function DeleteSourceForm({ tenantKey, id }: { tenantKey: string; id: string }) {
  const [state, action, pending] = useActionState(deleteSourceAction.bind(null, tenantKey, id), undefined);
  return (
    <form action={action} className="form">
      <Msg state={state} />
      <div className="field">
        <label htmlFor="confirm">Type &quot;delete&quot; to delete this source for good</label>
        <input id="confirm" name="confirm" autoComplete="off" />
      </div>
      <div className="form-actions">
        <button className="btn btn-danger btn-sm" type="submit" disabled={pending}>
          Delete source
        </button>
      </div>
    </form>
  );
}

export function SandboxForm({ tenantKey, base, grades }: { tenantKey: string; base: string; grades: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(sandboxAskAction.bind(null, tenantKey), undefined);
  const [as, setAs] = useState('family');
  return (
    <>
      <form action={action} className="form">
        <div className="field">
          <label htmlFor="question">Question</label>
          <textarea id="question" name="question" rows={3} maxLength={500} required defaultValue={state?.question ?? ''} placeholder="e.g. Can my child wear sneakers on Fridays?" />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="as">Answer as if asked by</label>
            <select id="as" name="as" value={as} onChange={(e) => setAs(e.target.value)}>
              <option value="public">A visitor (not signed in)</option>
              <option value="family">A signed-in family</option>
              <option value="staff">Staff</option>
            </select>
          </div>
        </div>
        {as === 'family' && (
          <fieldset className="field">
            <legend>Their children&apos;s grades</legend>
            <div className="check-grid">
              {grades.map((g) => (
                <label key={g.id} className="check">
                  <input type="checkbox" name="gradeIds" value={g.id} />
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="check">
          <input type="checkbox" name="includePending" />
          <span>Also use suggested sources that are not approved yet</span>
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? 'Asking…' : 'Ask'}
          </button>
          <span className="muted">Test questions count toward the monthly AI allowance.</span>
        </div>
      </form>
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.result && (
        <section className="panel" aria-label="Answer">
          <div className="panel-body ai-result">
            <AnswerView result={state.result} base={base} />
          </div>
        </section>
      )}
    </>
  );
}

export type Contact = { topic: string; name: string; email: string };

export function SettingsForm(p: {
  tenantKey: string;
  canEdit: boolean;
  defaults: { familiesEnabled: boolean; publicEnabled: boolean; retentionDays: number; storeQuestionText: boolean; contacts: Contact[] };
  topics: readonly (readonly [string, string])[];
}) {
  const [state, action, pending] = useActionState(saveSettingsAction.bind(null, p.tenantKey), undefined);
  const d = p.defaults;
  const rows: Contact[] = [...d.contacts, ...Array.from({ length: Math.max(3, 8 - d.contacts.length) }, () => ({ topic: 'general', name: '', email: '' }))].slice(0, 30);
  return (
    <form action={action} className="form">
      <Msg state={state} />
      <fieldset className="field">
        <legend>Who can use the assistant</legend>
        <label className="check">
          <input type="checkbox" name="familiesEnabled" defaultChecked={d.familiesEnabled} disabled={!p.canEdit} />
          <span>
            <strong>Signed-in families</strong> <span className="muted">They see public sources plus family sources for their grades.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" name="publicEnabled" defaultChecked={d.publicEnabled} disabled={!p.canEdit} />
          <span>
            <strong>Visitors who are not signed in</strong> <span className="muted">Public sources only.</span>
          </span>
        </label>
        <span className="hint">Turn it on after testing your sources in the Test tab. An &quot;Ask&quot; item then appears in the portal menu.</span>
      </fieldset>
      <fieldset className="field">
        <legend>Escalation contacts</legend>
        <span className="hint">When the assistant can&apos;t answer, it shows the contact for the question&apos;s topic, or the &quot;General&quot; one.</span>
        {rows.map((c, i) => (
          <div className="form-row" key={i}>
            <div className="field">
              <label htmlFor={`c_topic_${i}`}>Topic</label>
              <select id={`c_topic_${i}`} name="c_topic" defaultValue={c.topic} disabled={!p.canEdit}>
                {p.topics.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`c_name_${i}`}>Name or office</label>
              <input id={`c_name_${i}`} name="c_name" maxLength={100} defaultValue={c.name} disabled={!p.canEdit} />
            </div>
            <div className="field">
              <label htmlFor={`c_email_${i}`}>Email</label>
              <input id={`c_email_${i}`} name="c_email" type="email" maxLength={200} defaultValue={c.email} disabled={!p.canEdit} />
            </div>
          </div>
        ))}
      </fieldset>
      <fieldset className="field">
        <legend>Privacy</legend>
        <label className="check">
          <input type="checkbox" name="storeQuestionText" defaultChecked={d.storeQuestionText} disabled={!p.canEdit} />
          <span>
            <strong>Keep the text of questions and answers</strong>{' '}
            <span className="muted">Helps improve sources. Only the school owner can read it, and each read is logged. When off, only the topic and outcome are kept.</span>
          </span>
        </label>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="retentionDays">Delete questions after (days)</label>
          <input id="retentionDays" name="retentionDays" type="number" min={7} max={730} defaultValue={d.retentionDays} disabled={!p.canEdit} />
        </div>
      </fieldset>
      {p.canEdit && (
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Save settings
          </button>
        </div>
      )}
    </form>
  );
}

export function QuestionLogForm({ tenantKey, tz }: { tenantKey: string; tz: string }) {
  const [state, action, pending] = useActionState(readLogAction.bind(null, tenantKey), undefined);
  return (
    <>
      <form action={action} className="form">
        <div className="form-row">
          <div className="field">
            <label htmlFor="reason">Why do you need to read them?</label>
            <input id="reason" name="reason" required minLength={5} maxLength={300} placeholder="e.g. Monthly review of unanswered questions" />
          </div>
          <div className="field">
            <label htmlFor="outcome">Which</label>
            <select id="outcome" name="outcome" defaultValue="no_answer">
              <option value="no_answer">Not answered</option>
              <option value="answered">Answered</option>
              <option value="">All</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-quiet btn-sm" type="submit" disabled={pending}>
            Show questions
          </button>
          <span className="muted">This is recorded in the activity log.</span>
        </div>
      </form>
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.rows && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Question</th>
                <th scope="col">Outcome</th>
                <th scope="col">Topic</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap muted">{new Date(r.createdAt).toLocaleString('en-US', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{r.question ?? <span className="muted">(text not kept)</span>}</td>
                  <td>{r.outcome.replace('_', ' ')}</td>
                  <td className="muted">{r.topic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
