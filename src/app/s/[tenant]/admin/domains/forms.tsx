'use client';
import { useActionState, useState } from 'react';
import type { DomainResult } from './actions';

export function AddDomainForm({ run }: { run: (p: DomainResult, fd: FormData) => Promise<DomainResult> }) {
  const [state, action, pending] = useActionState(run, undefined);
  return (
    <form action={action} className="form">
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="hostname">Domain</label>
        <input id="hostname" name="hostname" required placeholder="portal.yourschool.org" autoCapitalize="none" spellCheck={false} />
        <span className="hint">Use a subdomain of your school’s website, such as portal.yourschool.org.</span>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add domain'}
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
      </div>
    </form>
  );
}

export function DomainButton({ run, label, kind = 'quiet', confirm }: { run: () => Promise<DomainResult>; label: string; kind?: 'primary' | 'quiet' | 'danger'; confirm?: string }) {
  const [state, action, pending] = useActionState<DomainResult>(run, undefined);
  const [armed, setArmed] = useState(false);
  if (confirm && !armed) {
    return (
      <button type="button" className={`btn btn-sm btn-${kind}`} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="inline-action">
      <button type="submit" className={`btn btn-sm btn-${kind}`} disabled={pending}>
        {confirm ?? label}
      </button>
      {confirm && (
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setArmed(false)}>
          Cancel
        </button>
      )}
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

export function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy-link" style={{ marginLeft: 0 }}>
      <code>{value}</code>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}
