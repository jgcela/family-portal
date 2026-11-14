'use client';
import { useActionState } from 'react';
import { saveCommunityAction } from './actions';

export type CommunityDefaults = {
  groupName: string;
  name: string;
  role: string;
  url: string;
  details: { label: string; value: string }[];
  visibility: string;
  isActive: boolean;
  sortOrder: number;
};

type Props = {
  tenantKey: string;
  id: string | null;
  kind: 'wishlist' | 'favorites';
  defaults: CommunityDefaults;
  groups: string[];
  /** Labels used on other staff cards, offered as suggestions. */
  labels: string[];
  maxDetails: number;
};

export function CommunityForm(p: Props) {
  const [state, action, pending] = useActionState(saveCommunityAction.bind(null, p.tenantKey, p.id, p.kind), undefined);
  const d = p.defaults;
  const fav = p.kind === 'favorites';
  // Existing lines, then the suggested labels not used yet, then a few blank rows.
  const used = new Set(d.details.map((x) => x.label));
  const rows = [...d.details, ...p.labels.filter((l) => !used.has(l)).map((label) => ({ label, value: '' }))];
  const blanks = Math.max(4 - rows.length, 2);
  for (let i = 0; i < blanks; i++) rows.push({ label: '', value: '' });
  const shown = rows.slice(0, p.maxDetails);
  return (
    <form action={action} className="form">
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required maxLength={120} defaultValue={d.name} placeholder="e.g. Mrs. Smith" />
        </div>
        <div className="field">
          <label htmlFor="role">{fav ? 'Role' : 'Class or subject'}</label>
          <input id="role" name="role" maxLength={160} defaultValue={d.role} placeholder={fav ? 'e.g. 3rd Grade Teacher' : 'e.g. 2nd Grade — 2A'} />
        </div>
      </div>
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="groupName">Group</label>
          <input id="groupName" name="groupName" list="community-groups" maxLength={60} defaultValue={d.groupName} placeholder="e.g. Preschool, Middle school" />
          <datalist id="community-groups">
            {p.groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="sortOrder">Order</label>
          <input id="sortOrder" name="sortOrder" type="number" min={0} max={10000} defaultValue={d.sortOrder} />
          <span className="hint">Lower numbers show first. Groups appear in the order of their first item.</span>
        </div>
      </div>
      {!fav && (
        <div className="field">
          <label htmlFor="url">Wishlist link</label>
          <input id="url" name="url" type="url" required maxLength={2048} defaultValue={d.url} placeholder="https://www.amazon.com/hz/wishlist/ls/…" />
        </div>
      )}
      {fav && (
        <fieldset className="field">
          <legend>Favorite things</legend>
          <p className="hint">Only filled lines show. Leave out anything the person did not agree to share, such as allergies or birthdays.</p>
          <datalist id="detail-labels">
            {p.labels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          {shown.map((r, i) => (
            <div className="form-row form-row-2" key={i}>
              <div className="field">
                <label htmlFor={`d${i}Label`} className="visually-hidden">
                  Line {i + 1} label
                </label>
                <input id={`d${i}Label`} name={`d${i}Label`} list="detail-labels" maxLength={60} defaultValue={r.label} placeholder="e.g. Morning drink" />
              </div>
              <div className="field">
                <label htmlFor={`d${i}Value`} className="visually-hidden">
                  Line {i + 1} answer
                </label>
                <input id={`d${i}Value`} name={`d${i}Value`} maxLength={300} defaultValue={r.value} />
              </div>
            </div>
          ))}
        </fieldset>
      )}
      <div className="field">
        <label htmlFor="visibility">Who can see it</label>
        <select id="visibility" name="visibility" defaultValue={d.visibility}>
          <option value="public">Everyone (public)</option>
          <option value="families">Families (signed in)</option>
          <option value="staff">Staff only</option>
        </select>
      </div>
      <label className="check">
        <input type="checkbox" name="isActive" defaultChecked={d.isActive} />
        Show it
      </label>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {p.id ? 'Save changes' : 'Add'}
        </button>
        {pending && <span className="muted">Saving…</span>}
      </div>
    </form>
  );
}
