'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

type Step = 'password' | 'totp' | 'backup';

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<Step>('password');

  function switchTo(s: Step) {
    setError(null);
    setStep(s);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      if (step === 'totp') {
        const code = String(form.get('code') ?? '').replace(/\s+/g, '');
        const { error } = await authClient.twoFactor.verifyTotp({ code });
        if (error) throw new Error(codeError(error, 'That code did not work. Use the newest 6-digit code from your authenticator app.'));
        window.location.assign(next);
        return;
      }
      if (step === 'backup') {
        const code = String(form.get('backup') ?? '').trim();
        const { error } = await authClient.twoFactor.verifyBackupCode({ code });
        if (error) throw new Error(codeError(error, 'That backup code did not work. Each code can be used only once.'));
        window.location.assign(next);
        return;
      }
      const { data, error } = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      if (error) throw new Error(error.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'Email or password is incorrect.');
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        setStep('totp');
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
      {step === 'password' && (
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
      )}
      {step === 'totp' && (
        <div className="field">
          <label htmlFor="code">6-digit code from your authenticator app</label>
          <input key="code" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
        </div>
      )}
      {step === 'backup' && (
        <div className="field">
          <label htmlFor="backup">Backup code</label>
          <input key="backup" id="backup" name="backup" autoComplete="off" autoCapitalize="none" spellCheck={false} required autoFocus />
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            One of the codes you saved when you turned on two-step sign-in. Each works once.
          </span>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : step === 'password' ? 'Sign in' : 'Verify code'}
      </button>
      {step === 'totp' && (
        <button type="button" className="btn btn-quiet" onClick={() => switchTo('backup')}>
          Use a backup code instead
        </button>
      )}
      {step === 'backup' && (
        <button type="button" className="btn btn-quiet" onClick={() => switchTo('totp')}>
          Use my authenticator app
        </button>
      )}
    </form>
  );
}

function codeError(error: { status?: number; code?: string }, fallback: string): string {
  const code = error.code ?? '';
  if (code.includes('LOCKED')) return 'Too many wrong codes. Wait 15 minutes and try again.';
  if (code.includes('TOO_MANY_ATTEMPTS') || code.includes('INVALID_TWO_FACTOR_COOKIE')) return 'This sign-in expired. Reload the page and sign in again.';
  if (error.status === 429) return 'Too many tries. Wait a minute and try again.';
  return fallback;
}
