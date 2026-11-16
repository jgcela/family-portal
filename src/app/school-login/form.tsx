'use client';
import { useActionState } from 'react';
import { goToSchool } from './actions';

export function SchoolLoginForm() {
  const [state, action, pending] = useActionState(goToSchool, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="field">
        <label htmlFor="school">School code or name</label>
        <input
          id="school"
          name="school"
          defaultValue={state?.value}
          required
          maxLength={200}
          autoComplete="organization"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="school-hint"
          autoFocus
        />
        <span id="school-hint" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          For example <code>stmary</code>, your portal address, or the school&rsquo;s full name.
        </span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Finding your school…' : 'Continue to sign in'}
      </button>
    </form>
  );
}
