'use client';
import { useActionState, useState } from 'react';
import type { Transition } from '@/server/services/workflow';

export type ActionResult = { error?: string; ok?: string } | undefined;

const LABELS: Record<Transition, string> = {
  submit: 'Send for review',
  approve: 'Approve',
  publish: 'Publish',
  unpublish: 'Unpublish',
  archive: 'Archive',
  restore: 'Restore as draft',
};

function TransitionButton({ action, run }: { action: Transition; run: (a: Transition) => Promise<ActionResult> }) {
  const [state, submit, pending] = useActionState<ActionResult>(() => run(action), undefined);
  return (
    <form action={submit}>
      <button className={`btn btn-sm ${action === 'publish' || action === 'approve' ? 'btn-accent' : 'btn-quiet'}`} type="submit" disabled={pending}>
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

/** Workflow buttons. `run` is a server action already bound to the school and record. */
export function Workflow({ actions, run }: { actions: Transition[]; run: (a: Transition) => Promise<ActionResult> }) {
  if (!actions.length) return null;
  return (
    <div className="form-actions">
      {actions.map((a) => (
        <TransitionButton key={a} action={a} run={run} />
      ))}
    </div>
  );
}

/** Delete with a typed confirmation. `run` is a bound server action that redirects on success. */
export function DeleteWithConfirm({ title, noun, run }: { title: string; noun: string; run: (prev: ActionResult, fd: FormData) => Promise<ActionResult> }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ActionResult, FormData>(run, undefined);
  if (!open) {
    return (
      <button className="btn btn-danger btn-sm" type="button" onClick={() => setOpen(true)}>
        Delete {noun}
      </button>
    );
  }
  const short = title.length > 40 ? `${title.slice(0, 40)}…` : title;
  return (
    <form action={submit} className="form" style={{ maxWidth: 420 }}>
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
          Delete “{short}”
        </button>
        <button className="btn btn-quiet btn-sm" type="button" onClick={() => setOpen(false)}>
          Keep {noun}
        </button>
      </div>
    </form>
  );
}
