'use client';
import { useActionState, useState } from 'react';
import type { StaffResult } from './actions';

export type Option = { id: string; name: string };
export type RoleOption = Option & { description: string | null; isOwnerRole: boolean };

export function ScopeSelect({ id, grades, audiences }: { id: string; grades: Option[]; audiences: Option[] }) {
  return (
    <div className="field">
      <label htmlFor={id}>Limited to</label>
      <select id={id} name="scope" defaultValue="school">
        <option value="school">The whole school</option>
        {grades.length > 0 && (
          <optgroup label="One grade">
            {grades.map((g) => (
              <option key={g.id} value={`grade:${g.id}`}>
                {g.name}
              </option>
            ))}
          </optgroup>
        )}
        {audiences.length > 0 && (
          <optgroup label="One group">
            {audiences.map((a) => (
              <option key={a.id} value={`audience:${a.id}`}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span className="hint">Roles with school-wide permissions (like managing modules) cannot be limited.</span>
    </div>
  );
}

function RoleSelect({ id, roles }: { id: string; roles: RoleOption[] }) {
  const [sel, setSel] = useState(roles.find((r) => !r.isOwnerRole)?.id ?? '');
  const desc = roles.find((r) => r.id === sel)?.description;
  return (
    <div className="field">
      <label htmlFor={id}>Role</label>
      <select id={id} name="roleId" value={sel} onChange={(e) => setSel(e.target.value)} required>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {desc && <span className="hint">{desc}</span>}
    </div>
  );
}

export function InviteForm({ run, roles, grades, audiences }: { run: (p: StaffResult, fd: FormData) => Promise<StaffResult>; roles: RoleOption[]; grades: Option[]; audiences: Option[] }) {
  const [state, action, pending] = useActionState(run, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="form">
      {state?.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.link && (
        <div className="notice notice-ok invite-link" role="status">
          <p>
            <strong>Invitation created.</strong> Send this link to the person (email, text message…). It works once and
            expires in 7 days. For security it is shown only now.
          </p>
          <code>{state.link}</code>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      <form
        action={(fd) => {
          setCopied(false);
          action(fd);
        }}
        className="form"
      >
        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="inv-name">Name</label>
            <input id="inv-name" name="name" required maxLength={120} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-title">Job title (optional)</label>
            <input id="inv-title" name="title" maxLength={120} placeholder="e.g. 3rd grade teacher" />
          </div>
          <RoleSelect id="inv-role" roles={roles} />
          <ScopeSelect id="inv-scope" grades={grades} audiences={audiences} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Create invitation link
          </button>
          {pending && <span className="muted">Creating…</span>}
        </div>
      </form>
    </div>
  );
}

export function AddRoleForm({ run, roles, grades, audiences, idPrefix }: { run: (p: StaffResult, fd: FormData) => Promise<StaffResult>; roles: RoleOption[]; grades: Option[]; audiences: Option[]; idPrefix: string }) {
  const [state, action, pending] = useActionState(run, undefined);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(true)}>
        Add role
      </button>
    );
  }
  return (
    <form action={action} className="form add-role">
      <RoleSelect id={`${idPrefix}-role`} roles={roles} />
      <ScopeSelect id={`${idPrefix}-scope`} grades={grades} audiences={audiences} />
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          Add
        </button>
        <button className="btn btn-quiet btn-sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="muted">{state.ok}</p>}
    </form>
  );
}

/** Button that asks for a second click before running a destructive action. */
export function ConfirmButton({ run, label, confirmLabel, danger = false }: { run: () => Promise<StaffResult>; label: string; confirmLabel: string; danger?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState<StaffResult>(run, undefined);
  return (
    <span className="inline-action">
      {armed ? (
        <form action={action} className="inline-action">
          <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-quiet'}`} type="submit" disabled={pending}>
            {confirmLabel}
          </button>
          <button className="btn btn-quiet btn-sm" type="button" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-quiet'}`} type="button" onClick={() => setArmed(true)}>
          {label}
        </button>
      )}
      {state?.error && (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      )}
    </span>
  );
}
