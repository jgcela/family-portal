'use client';
import { useActionState, useState } from 'react';
import { deleteEventAction, transitionEventAction, type FormState } from '../actions';
import type { EventTransition } from '@/server/services/calendar';

const LABELS: Record<EventTransition, string> = {
  submit: 'Send for review',
  approve: 'Approve',
  publish: 'Publish',
  unpublish: 'Unpublish',
  archive: 'Archive',
  restore: 'Restore as draft',
};

function TransitionButton({ tenantKey, eventId, action }: { tenantKey: string; eventId: string; action: EventTransition }) {
  const [state, run, pending] = useActionState<FormState>(transitionEventAction.bind(null, tenantKey, eventId, action), undefined);
  return (
    <form action={run}>
      <button
        className={`btn btn-sm ${action === 'publish' || action === 'approve' ? 'btn-accent' : 'btn-quiet'}`}
        type="submit"
        disabled={pending}
      >
        {LABELS[action]}
      </button>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function WorkflowActions({ tenantKey, eventId, actions }: { tenantKey: string; eventId: string; actions: EventTransition[] }) {
  if (!actions.length) return null;
  return (
    <div className="form-actions">
      {actions.map((a) => (
        <TransitionButton key={a} tenantKey={tenantKey} eventId={eventId} action={a} />
      ))}
    </div>
  );
}

export function DeleteEvent({ tenantKey, eventId, title }: { tenantKey: string; eventId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState<FormState, FormData>(deleteEventAction.bind(null, tenantKey, eventId), undefined);
  if (!open) {
    return (
      <button className="btn btn-danger btn-sm" type="button" onClick={() => setOpen(true)}>
        Delete event
      </button>
    );
  }
  return (
    <form action={run} className="form" style={{ maxWidth: 420 }}>
      <p>
        Delete <strong>{title}</strong> permanently? Families will stop seeing it. To keep a record instead, use Archive.
      </p>
      <div className="field">
        <label htmlFor="confirm">Type delete to confirm</label>
        <input id="confirm" name="confirm" autoComplete="off" required />
      </div>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn btn-danger btn-sm" type="submit" disabled={pending}>
          Delete “{title.length > 40 ? `${title.slice(0, 40)}…` : title}”
        </button>
        <button className="btn btn-quiet btn-sm" type="button" onClick={() => setOpen(false)}>
          Keep event
        </button>
      </div>
    </form>
  );
}
