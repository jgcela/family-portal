'use client';
import { useActionState, useState } from 'react';
import { confirmDraftAction, dismissDraftAction, sendAction, type DraftState } from './actions';

export function MessageForm({ tenantKey, conversationId, examples }: { tenantKey: string; conversationId: string | null; examples: string[] }) {
  const [state, action, pending] = useActionState(sendAction.bind(null, tenantKey, conversationId), undefined);
  const [text, setText] = useState(state?.text ?? '');
  return (
    <form action={action} className="ai-form fa-form">
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="message">{conversationId ? 'Your reply' : 'How can we help?'}</label>
        <textarea id="message" name="message" rows={3} maxLength={1000} required value={text} onChange={(e) => setText(e.target.value)} />
        <span className="hint">The assistant can look up your children, your requests and the school&apos;s information. It never sends anything without you pressing Send.</span>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Working on it…' : 'Send message'}
        </button>
        {!conversationId &&
          examples.map((x) => (
            <button key={x} type="button" className="btn btn-quiet btn-sm" onClick={() => setText(x)}>
              {x}
            </button>
          ))}
      </div>
      {pending && (
        <p className="muted" role="status">
          This can take up to a minute.
        </p>
      )}
    </form>
  );
}

export function DraftButtons({ tenantKey, actionId }: { tenantKey: string; actionId: string }) {
  const [sent, send, sending] = useActionState<DraftState>(confirmDraftAction.bind(null, tenantKey, actionId), undefined);
  const [gone, dismiss, dismissing] = useActionState<DraftState>(dismissDraftAction.bind(null, tenantKey, actionId), undefined);
  const done = sent?.ok ?? gone?.ok;
  const error = sent?.error ?? gone?.error;
  if (done) return <p role="status" className="fa-draft-result">{done}</p>;
  return (
    <>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <form action={send}>
          <button className="btn btn-primary" type="submit" disabled={sending || dismissing}>
            {sending ? 'Sending…' : 'Send to the office'}
          </button>
        </form>
        <form action={dismiss}>
          <button className="btn btn-quiet" type="submit" disabled={sending || dismissing}>
            Discard
          </button>
        </form>
      </div>
    </>
  );
}
