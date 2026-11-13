'use client';
import { useActionState } from 'react';
import type { DesignResult } from './actions';

/** A one-click server action (bound on the server) with inline result. */
export function ActionButton({
  run,
  label,
  className = 'btn btn-quiet btn-sm',
  ariaLabel,
}: {
  run: () => Promise<DesignResult>;
  label: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [state, submit, pending] = useActionState<DesignResult>(run, undefined);
  return (
    <form action={submit} className="inline-action">
      <button className={className} type="submit" disabled={pending} aria-label={ariaLabel}>
        {label}
      </button>
      {state?.error && (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      )}
      {state?.ok && (
        <span className="muted" role="status">
          {state.ok}
        </span>
      )}
    </form>
  );
}
