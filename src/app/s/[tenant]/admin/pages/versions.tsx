'use client';
import { useActionState } from 'react';
import type { ActionResult } from '../_components/workflow';

function RestoreButton({ run, version }: { run: () => Promise<ActionResult>; version: number }) {
  const [state, submit, pending] = useActionState<ActionResult>(run, undefined);
  return (
    <form action={submit}>
      <button className="btn btn-quiet btn-sm" type="submit" disabled={pending} aria-label={`Copy version ${version} into the draft`}>
        Use this version
      </button>
      {state?.error && <p className="field-error">{state.error}</p>}
      {state?.ok && <p className="muted">{state.ok}</p>}
    </form>
  );
}

export function VersionRow({ version, when, live, run, canRestore }: { version: number; when: string; live: boolean; run: () => Promise<ActionResult>; canRestore: boolean }) {
  return (
    <tr>
      <td>v{version}</td>
      <td className="nowrap">{when}</td>
      <td>{live ? <span className="status status-published">Live</span> : null}</td>
      <td>{canRestore && !live && <RestoreButton run={run} version={version} />}</td>
    </tr>
  );
}
