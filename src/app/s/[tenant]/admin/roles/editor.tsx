'use client';
import { useActionState, useState } from 'react';
import type { RoleResult } from './actions';

export type PermissionOption = { key: string; label: string; group: string; scopable: boolean; allowed: boolean; reason?: string };

type Props = {
  run: (prev: RoleResult, fd: FormData) => Promise<RoleResult>;
  defaults: { name: string; description: string; permissions: string[] };
  options: PermissionOption[];
  submitLabel: string;
  limitedGrants: boolean;
};

export function RoleEditor({ run, defaults, options, submitLabel, limitedGrants }: Props) {
  const [state, action, pending] = useActionState(run, undefined);
  const [checked, setChecked] = useState(() => new Set(defaults.permissions));
  const groups = [...new Set(options.map((o) => o.group))];
  const toggle = (k: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });
  const schoolWide = options.filter((o) => checked.has(o.key) && !o.scopable).length;
  return (
    <form action={action} className="form role-editor">
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
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="role-name">Name</label>
          <input id="role-name" name="name" required maxLength={60} defaultValue={defaults.name} placeholder="e.g. Front office" />
        </div>
        <div className="field">
          <label htmlFor="role-desc">Description (optional)</label>
          <input id="role-desc" name="description" maxLength={300} defaultValue={defaults.description} />
        </div>
      </div>
      <p className="hint">
        {checked.size} permissions selected.{' '}
        {schoolWide > 0
          ? 'Includes school-wide permissions, so this role can only be given for the whole school.'
          : 'This role can be given for the whole school or limited to a grade or audience.'}
        {limitedGrants && ' Some people have this role for a single grade or audience, so school-wide permissions cannot be added.'}
      </p>
      {groups.map((g) => (
        <fieldset key={g} className="perm-group">
          <legend>{g}</legend>
          <div className="perm-list">
            {options
              .filter((o) => o.group === g)
              .map((o) => (
                <label key={o.key} className={o.allowed ? 'check' : 'check check-off'} title={o.reason}>
                  <input
                    type="checkbox"
                    name="permission"
                    value={o.key}
                    checked={checked.has(o.key)}
                    disabled={!o.allowed}
                    onChange={(e) => toggle(o.key, e.target.checked)}
                  />
                  <span>
                    {o.label}
                    {!o.scopable && <span className="perm-tag">school-wide</span>}
                    {!o.allowed && o.reason && <span className="perm-tag">{o.reason}</span>}
                  </span>
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      {/* Disabled boxes are not submitted; keep permissions the editor can't change. */}
      {options
        .filter((o) => !o.allowed && checked.has(o.key))
        .map((o) => (
          <input key={o.key} type="hidden" name="permission" value={o.key} />
        ))}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function DeleteRoleButton({ run }: { run: () => Promise<RoleResult> }) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState<RoleResult>(run, undefined);
  return (
    <div className="inline-action">
      {armed ? (
        <form action={action} className="inline-action">
          <button className="btn btn-sm btn-danger" type="submit" disabled={pending}>
            Delete role
          </button>
          <button className="btn btn-sm btn-quiet" type="button" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-sm btn-danger" type="button" onClick={() => setArmed(true)}>
          Delete…
        </button>
      )}
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
