'use client';
import { useActionState } from 'react';
import type { SupportResult } from './actions';

export function DecisionButton({ run, label, kind = 'quiet' }: { run: () => Promise<SupportResult>; label: string; kind?: 'primary' | 'quiet' | 'danger' }) {
  const [state, action, pending] = useActionState<SupportResult>(run, undefined);
  return (
    <form action={action} className="inline-action">
      <button type="submit" className={`btn btn-sm btn-${kind}`} disabled={pending}>
        {label}
      </button>
      {state?.error && (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
