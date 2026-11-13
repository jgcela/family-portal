'use client';
import { useActionState } from 'react';
import type { PlatformResult } from '../_components/actions-shared';

type Run = (p: PlatformResult, fd: FormData) => Promise<PlatformResult>;

function Msg({ state }: { state: PlatformResult }) {
  if (state?.error)
    return (
      <span className="field-error" role="alert">
        {state.error}
      </span>
    );
  if (state?.ok)
    return (
      <span className="muted" role="status">
        {state.ok}
      </span>
    );
  return null;
}

const ROLES = [
  { id: 'owner', label: 'Owner: everything, including the team' },
  { id: 'operator', label: 'Operator: schools, plans and status' },
  { id: 'support', label: 'Support: view schools, ask for support access' },
];

export function AddMemberForm({ run }: { run: Run }) {
  const [state, action, pending] = useActionState(run, undefined);
  return (
    <form action={action} className="form">
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="m-email">Email of an existing account</label>
          <input id="m-email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="m-role">Role</label>
          <select id="m-role" name="role" defaultValue="support">
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          Add to team
        </button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function RoleForm({ run, role, id }: { run: Run; role: string; id: string }) {
  const [state, action, pending] = useActionState(run, undefined);
  return (
    <form action={action} className="inline-action">
      <label htmlFor={`r-${id}`} className="visually-hidden">
        Role
      </label>
      <select id={`r-${id}`} name="role" defaultValue={role}>
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.id}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-quiet btn-sm" disabled={pending}>
        Save
      </button>
      <Msg state={state} />
    </form>
  );
}

export function RemoveForm({ run }: { run: () => Promise<PlatformResult> }) {
  const [state, action, pending] = useActionState<PlatformResult>(run, undefined);
  return (
    <form action={action} className="inline-action">
      <button type="submit" className="btn btn-danger btn-sm" disabled={pending}>
        Remove
      </button>
      <Msg state={state} />
    </form>
  );
}
