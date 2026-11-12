'use client';
import { useActionState } from 'react';
import { saveAnnouncementAction } from './actions';
import { MarkdownField } from '../_components/markdown-field';

export type AnnouncementDefaults = {
  title: string;
  summary: string;
  body: string;
  isUrgent: boolean;
  isPinned: boolean;
  publishAt: string;
  expiresAt: string;
};

type Props = {
  tenantKey: string;
  id: string | null;
  defaults: AnnouncementDefaults;
  audiencePicker: React.ReactNode;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived' | null;
  canPublish: boolean;
  requireApproval: boolean;
  timezone: string;
};

export function AnnouncementForm(p: Props) {
  const [state, action, pending] = useActionState(saveAnnouncementAction.bind(null, p.tenantKey, p.id), undefined);
  const d = p.defaults;
  const editable = p.status === null || p.status === 'draft';
  const showPublish = p.canPublish && (p.requireApproval ? p.status === 'approved' : editable || p.status === 'approved');
  const showSubmit = p.requireApproval && editable;
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
      <div className="field">
        <label htmlFor="summary">Short summary</label>
        <input id="summary" name="summary" maxLength={300} defaultValue={d.summary} />
        <span className="hint">Shown on the homepage card. If empty, the start of the text is used.</span>
      </div>
      <MarkdownField name="body" label="Text" defaultValue={d.body} maxLength={50_000} />
      <div className="form-row">
        <label className="check">
          <input type="checkbox" name="isUrgent" defaultChecked={d.isUrgent} />
          Urgent (shown first, highlighted)
        </label>
        <label className="check">
          <input type="checkbox" name="isPinned" defaultChecked={d.isPinned} />
          Pin to the top
        </label>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="publishAt">Show from</label>
          <input id="publishAt" name="publishAt" type="datetime-local" defaultValue={d.publishAt} />
          <span className="hint">Empty = as soon as it is published.</span>
        </div>
        <div className="field">
          <label htmlFor="expiresAt">Hide after</label>
          <input id="expiresAt" name="expiresAt" type="datetime-local" defaultValue={d.expiresAt} />
          <span className="hint">Empty = keep showing. Times in {p.timezone.replace('_', ' ')}.</span>
        </div>
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
