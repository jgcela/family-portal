'use client';
import { useActionState } from 'react';
import type { OpsResult } from '../_ops/actions';
import { Msg } from '../_ops/forms';

export function TemplateButton({ action, label }: { action: () => Promise<OpsResult>; label: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="inline-action">
      <button className="btn btn-quiet btn-sm" type="submit" disabled={pending}>
        {label}
      </button>
      <Msg state={state} />
    </form>
  );
}
