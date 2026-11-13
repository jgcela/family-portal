'use client';
import { useActionState, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import type { AcceptResult } from './actions';

export function NewAccountForm({ run, email, defaultName, next }: { run: (p: AcceptResult, fd: FormData) => Promise<AcceptResult>; email: string; defaultName: string; next: string }) {
  const [state, action, pending] = useActionState(run, undefined);
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);

  // Account created: sign in with the password just chosen, then go to the dashboard.
  useEffect(() => {
    if (!state?.email || !password) return;
    authClient.signIn
      .email({ email: state.email, password })
      .then(({ error }) => {
        if (error) setSignInError('Your account is ready, but signing in failed. Use the sign-in page.');
        else window.location.assign(next);
      })
      .catch(() => setSignInError('Your account is ready, but signing in failed. Use the sign-in page.'));
  }, [state?.email, password, next]);

  return (
    <form action={action} className="auth-form" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" value={email} readOnly aria-readonly="true" />
      </div>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" defaultValue={defaultName} required maxLength={120} autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="password">Choose a password</label>
        <input id="password" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="hint">At least 12 characters. A short sentence is easy to remember.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Repeat the password</label>
        <input id="confirm" name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password" />
      </div>
      {(state?.error || signInError) && (
        <p className="field-error" role="alert">
          {state?.error ?? signInError}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending || !!state?.email}>
        {state?.email ? 'Signing you in…' : pending ? 'Creating your account…' : 'Create account and join'}
      </button>
    </form>
  );
}

export function AcceptExistingButton({ run }: { run: () => Promise<AcceptResult> }) {
  const [state, action, pending] = useActionState<AcceptResult>(run, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        Accept invitation
      </button>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
