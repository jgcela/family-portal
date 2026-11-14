'use client';
// Upload a prepared .json file into a module (Volunteer, Community…).
import { useActionState } from 'react';

type Result = { error?: string; ok?: string } | undefined;

export function ImportForm({ run, canPublish, submitLabel = 'Import as drafts' }: { run: (prev: Result, fd: FormData) => Promise<Result>; canPublish: boolean; submitLabel?: string }) {
  const [state, action, pending] = useActionState(run, undefined);
  return (
    <form action={action} className="form" style={{ maxWidth: 560 }}>
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="notice notice-ok" role="status">
          {state.ok}
        </div>
      )}
      <div className="field">
        <label htmlFor="import-file">File (.json)</label>
        <input id="import-file" name="file" type="file" accept=".json,application/json" required />
        <span className="hint">Every item is checked first. If one is wrong, nothing is added and the message says which one.</span>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" name="then" value="" disabled={pending}>
          {submitLabel}
        </button>
        {canPublish && (
          <button className="btn btn-accent" type="submit" name="then" value="publish" disabled={pending}>
            Import and publish
          </button>
        )}
        {pending && <span className="muted">Importing…</span>}
      </div>
    </form>
  );
}
