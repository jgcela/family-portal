'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { cancelAction, newRequestAction, replyAction } from './actions';

export function NewRequestForm({ tenantKey, base, kids, defaultSubject, defaultBody, kind }: { tenantKey: string; base: string; kids: { id: string; name: string }[]; defaultSubject?: string; defaultBody?: string; kind?: 'question' | 'request' }) {
  const [state, action, pending] = useActionState(newRequestAction.bind(null, tenantKey), undefined);
  if (state?.ok) {
    return (
      <div className="ops-receipt" role="status">
        <h2>{state.ok}</h2>
        <p>The office will answer here. You can add more details on the request page.</p>
        {state.id && (
          <Link className="btn btn-primary" href={`${base}/requests/${state.id}`}>
            Open the request
          </Link>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="ops-form">
      <input type="hidden" name="kind" value={kind ?? 'request'} />
      <div className="field">
        <label htmlFor="subject">Subject</label>
        <input id="subject" name="subject" required minLength={3} maxLength={150} defaultValue={defaultSubject} />
      </div>
      {kids.length > 0 && (
        <div className="field">
          <label htmlFor="req-student">About (optional)</label>
          <select id="req-student" name="studentId" defaultValue="">
            <option value="">The whole family / not about one child</option>
            {kids.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="body">Message</label>
        <textarea id="body" name="body" rows={5} required maxLength={3000} defaultValue={defaultBody} />
        <span className="hint">Don&apos;t include passwords or medical details.</span>
      </div>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send to the office'}
        </button>
      </div>
    </form>
  );
}

export function ReplyForm({ tenantKey, id }: { tenantKey: string; id: string }) {
  const [state, action, pending] = useActionState(replyAction.bind(null, tenantKey, id), undefined);
  const [text, setText] = useState('');
  return (
    <form
      action={async (fd) => {
        await action(fd);
        setText('');
      }}
      className="ops-form"
    >
      <div className="field">
        <label htmlFor="reply">Add a message</label>
        <textarea id="reply" name="body" rows={3} maxLength={3000} required value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && <p role="status">{state.ok}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Send
        </button>
      </div>
    </form>
  );
}

export function CancelForm({ tenantKey, id, noticeId, label }: { tenantKey: string; id: string; noticeId: string | null; label: string }) {
  const [state, action, pending] = useActionState(cancelAction.bind(null, tenantKey, id, noticeId), undefined);
  const [confirm, setConfirm] = useState(false);
  return (
    <form action={action} className="btn-row">
      {confirm ? (
        <>
          <button className="btn btn-quiet" type="submit" disabled={pending}>
            Yes, cancel it
          </button>
          <button className="btn btn-quiet" type="button" onClick={() => setConfirm(false)}>
            Keep it
          </button>
        </>
      ) : (
        <button className="btn btn-quiet" type="button" onClick={() => setConfirm(true)}>
          {label}
        </button>
      )}
      {state?.error && (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
