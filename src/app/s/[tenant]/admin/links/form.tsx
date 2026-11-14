'use client';
import { useActionState } from 'react';
import { saveLinkAction } from './actions';
import { VisibilitySelect } from '../_components/audience-picker';

export type LinkDefaults = {
  menu: string;
  label: string;
  target: string;
  visibility: string;
  opensInNewTab: boolean;
  isActive: boolean;
  position: number;
};

type Props = { tenantKey: string; id: string | null; defaults: LinkDefaults; menus: { value: string; label: string; hint: string }[] };

export function LinkForm(p: Props) {
  const [state, action, pending] = useActionState(saveLinkAction.bind(null, p.tenantKey, p.id), undefined);
  const d = p.defaults;
  return (
    <form action={action} className="form">
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      <fieldset className="field">
        <legend>Where it shows</legend>
        {p.menus.map((m) => (
          <label className="check" key={m.value}>
            <input type="radio" name="menu" value={m.value} defaultChecked={d.menu === m.value} required />
            <span>
              <strong>{m.label}</strong> <span className="muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="label">Label</label>
          <input id="label" name="label" required maxLength={60} defaultValue={d.label} placeholder="e.g. FACTS Login" />
        </div>
        <div className="field">
          <label htmlFor="position">Order</label>
          <input id="position" name="position" type="number" min={0} max={10000} defaultValue={d.position} />
          <span className="hint">Lower numbers show first.</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="target">Link</label>
        <input id="target" name="target" required maxLength={2048} defaultValue={d.target} placeholder="https://… or /documents" />
        <span className="hint">
          A web address (https://…), an email (mailto:…), a phone (tel:…) or a page of this portal starting with / (for example /documents, /calendar or /d/parent-handbook).
        </span>
      </div>
      <VisibilitySelect value={d.visibility} />
      <div className="form-row">
        <label className="check">
          <input type="checkbox" name="opensInNewTab" defaultChecked={d.opensInNewTab} />
          Open in a new tab
        </label>
        <label className="check">
          <input type="checkbox" name="isActive" defaultChecked={d.isActive} />
          Show it
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {p.id ? 'Save changes' : 'Add link'}
        </button>
        {pending && <span className="muted">Saving…</span>}
      </div>
    </form>
  );
}
