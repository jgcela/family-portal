'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Change password
      </button>
    );
  }
  return (
    <form
      className="auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const current = String(f.get('current') ?? '');
        const next = String(f.get('next') ?? '');
        if (next.length < 12) return setMsg({ error: 'Use at least 12 characters for the new password.' });
        if (next !== f.get('confirm')) return setMsg({ error: 'The two new passwords do not match.' });
        setPending(true);
        const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
        setPending(false);
        if (error) return setMsg({ error: 'Your current password is not right.' });
        e.currentTarget?.reset();
        setMsg({ ok: 'Password changed. Other devices were signed out.' });
      }}
    >
      <div className="field">
        <label htmlFor="pw-current">Current password</label>
        <input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="pw-next">New password</label>
        <input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </div>
      <div className="field">
        <label htmlFor="pw-confirm">Repeat the new password</label>
        <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </div>
      {msg.error && (
        <p className="field-error" role="alert">
          {msg.error}
        </p>
      )}
      {msg.ok && <p role="status">{msg.ok}</p>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}
