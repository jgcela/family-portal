'use client';
import { useActionState, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import type { JoinResult, JoinValues } from './actions';

type Grade = { id: string; name: string };

function RequestFields({ grades, v = {} }: { grades: Grade[]; v?: JoinValues }) {
  return (
    <>
      <div className="field">
        <label htmlFor="code">School code</label>
        <input id="code" name="code" defaultValue={v.code} required maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        <span className="hint">The school shares this code with families (newsletter, office).</span>
      </div>
      <fieldset className="field">
        <legend>Your children&rsquo;s grades</legend>
        <div className="grade-grid">
          {grades.map((g) => (
            <label key={g.id} className="check">
              <input type="checkbox" name="gradeIds" value={g.id} defaultChecked={v.gradeIds?.includes(g.id)} /> {g.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="note">Note for the school office</label>
        <textarea id="note" name="note" defaultValue={v.note} required maxLength={1000} rows={3} placeholder="Your children's names and grades, e.g. Ana García (3rd) and Leo García (K)" />
        <span className="hint">The office uses this to confirm your family before approving.</span>
      </div>
    </>
  );
}

export function NewFamilyForm({ run, grades, next }: { run: (p: JoinResult, fd: FormData) => Promise<JoinResult>; grades: Grade[]; next: string }) {
  const [state, action, pending] = useActionState(run, undefined);
  // The form clears after submitting, so keep the password to sign in with.
  const password = useRef('');
  useEffect(() => {
    if (!state?.email) return;
    authClient.signIn.email({ email: state.email, password: password.current }).finally(() => window.location.assign(next));
  }, [state, next]);
  const v = state?.values ?? {};
  return (
    <form
      key={JSON.stringify(v)}
      action={action}
      className="auth-form"
      onSubmit={(e) => {
        password.current = (e.currentTarget.elements.namedItem('password') as HTMLInputElement).value;
      }}
    >
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" defaultValue={v.name} required maxLength={120} autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={v.email} required maxLength={254} autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Choose a password</label>
        <input id="password" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" />
        <span className="hint">At least 12 characters. A short sentence is easy to remember.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Repeat the password</label>
        <input id="confirm" name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password" />
      </div>
      <RequestFields grades={grades} v={v} />
      <button className="btn btn-primary" type="submit" disabled={pending || !!state?.done}>
        {pending ? 'Sending…' : state?.done ? 'Signing you in…' : 'Request access'}
      </button>
    </form>
  );
}

export function ExistingFamilyForm({ run, grades }: { run: (p: JoinResult, fd: FormData) => Promise<JoinResult>; grades: Grade[] }) {
  const [state, action, pending] = useActionState(run, undefined);
  useEffect(() => {
    if (state?.done) window.location.reload();
  }, [state]);
  return (
    <form key={JSON.stringify(state?.values ?? {})} action={action} className="auth-form">
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <RequestFields grades={grades} v={state?.values} />
      <button className="btn btn-primary" type="submit" disabled={pending || !!state?.done}>
        {pending ? 'Sending…' : 'Request access'}
      </button>
    </form>
  );
}
