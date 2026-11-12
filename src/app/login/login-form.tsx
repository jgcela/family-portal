'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      if (needsCode) {
        const { error } = await authClient.twoFactor.verifyTotp({ code: String(form.get('code') ?? '') });
        if (error) throw new Error('That code did not work. Check your authenticator app and try again.');
        window.location.assign(next);
        return;
      }
      const { data, error } = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      if (error) throw new Error('Email or password is incorrect.');
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        setNeedsCode(true);
        return;
      }
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-form" style={{ display: 'grid', gap: 'var(--space-4)' }} noValidate>
      {!needsCode ? (
        <>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="code">6-digit code from your authenticator app</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : needsCode ? 'Verify code' : 'Sign in'}
      </button>
    </form>
  );
}
