'use client';
import { useActionState } from 'react';
import { saveVolunteerAction } from './actions';
import { MarkdownField } from '../_components/markdown-field';

export type VolunteerDefaults = {
  title: string;
  category: string;
  organizer: string;
  location: string;
  schedule: string;
  commitment: string;
  summary: string;
  body: string;
  actions: { label: string; url: string }[];
  sortOrder: number;
};

type Props = {
  tenantKey: string;
  id: string | null;
  defaults: VolunteerDefaults;
  categories: string[];
  audiencePicker: React.ReactNode;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived' | null;
  canPublish: boolean;
  requireApproval: boolean;
};

export function VolunteerForm(p: Props) {
  const [state, action, pending] = useActionState(saveVolunteerAction.bind(null, p.tenantKey, p.id), undefined);
  const d = p.defaults;
  const editable = p.status === null || p.status === 'draft';
  const showPublish = p.canPublish && (p.requireApproval ? p.status === 'approved' : editable || p.status === 'approved');
  const showSubmit = p.requireApproval && editable;
  const rows = [0, 1, 2, 3];
  return (
    <form action={action} className="form">
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={200} defaultValue={d.title} />
      </div>
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="category">Type</label>
          <input id="category" name="category" list="vol-categories" maxLength={60} defaultValue={d.category} placeholder="e.g. Classroom, Faith, Events" />
          <datalist id="vol-categories">
            {p.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="organizer">Organized by</label>
          <input id="organizer" name="organizer" maxLength={120} defaultValue={d.organizer} />
        </div>
      </div>
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="location">Where</label>
          <input id="location" name="location" maxLength={120} defaultValue={d.location} />
        </div>
        <div className="field">
          <label htmlFor="schedule">When</label>
          <input id="schedule" name="schedule" maxLength={120} defaultValue={d.schedule} placeholder="e.g. Fridays · 10:40 a.m.–12:30 p.m." />
        </div>
      </div>
      <div className="field">
        <label htmlFor="commitment">Who / time needed</label>
        <input id="commitment" name="commitment" maxLength={120} defaultValue={d.commitment} placeholder="e.g. 3 volunteers each Friday" />
      </div>
      <div className="field">
        <label htmlFor="summary">Short description</label>
        <textarea id="summary" name="summary" maxLength={1000} rows={3} defaultValue={d.summary} />
        <span className="hint">Shown on the card.</span>
      </div>
      <MarkdownField name="body" label="Details" defaultValue={d.body} maxLength={20_000} />
      <fieldset className="field">
        <legend>Buttons</legend>
        <span className="hint">A sign-up page (https://…), an email (mailto:name@example.org) or a phone (tel:+13035551234). Up to 4.</span>
        {rows.map((i) => (
          <div className="form-row form-row-2" key={i}>
            <div className="field">
              <label htmlFor={`action${i}Label`}>Button {i + 1} label</label>
              <input id={`action${i}Label`} name={`action${i}Label`} maxLength={60} defaultValue={d.actions[i]?.label ?? ''} />
            </div>
            <div className="field">
              <label htmlFor={`action${i}Url`}>Button {i + 1} link</label>
              <input id={`action${i}Url`} name={`action${i}Url`} maxLength={2048} defaultValue={d.actions[i]?.url ?? ''} />
            </div>
          </div>
        ))}
      </fieldset>
      <div className="field" style={{ maxWidth: 200 }}>
        <label htmlFor="sortOrder">Order</label>
        <input id="sortOrder" name="sortOrder" type="number" min={0} max={10000} defaultValue={d.sortOrder} />
        <span className="hint">Lower numbers show first.</span>
      </div>
      {p.audiencePicker}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" name="then" value="" disabled={pending}>
          {p.status === 'published' ? 'Save changes' : 'Save draft'}
        </button>
        {showPublish && (
          <button className="btn btn-accent" type="submit" name="then" value="publish" disabled={pending}>
            Save and publish
          </button>
        )}
        {showSubmit && (
          <button className="btn btn-quiet" type="submit" name="then" value="submit" disabled={pending}>
            Save and send for review
          </button>
        )}
        {pending && <span className="muted">Saving…</span>}
      </div>
    </form>
  );
}
