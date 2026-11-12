'use client';
import { useActionState, useState } from 'react';
import { savePageAction } from './actions';
import { MarkdownField } from '../_components/markdown-field';

type Props = {
  tenantKey: string;
  id: string | null;
  defaults: { title: string; slug: string; body: string; showToc: boolean; sortOrder: number };
  audiencePicker: React.ReactNode;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived' | null;
  canPublish: boolean;
  requireApproval: boolean;
  isLive: boolean;
  urlPrefix: string;
};

const toSlug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function PageForm(p: Props) {
  const [state, action, pending] = useActionState(savePageAction.bind(null, p.tenantKey, p.id), undefined);
  const d = p.defaults;
  const [slug, setSlug] = useState(d.slug);
  const [slugTouched, setSlugTouched] = useState(!!p.id);
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
      {p.isLive && (
        <div className="notice">Families see the last published version. Your changes stay in a draft until you publish again.</div>
      )}
      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={d.title}
          onChange={(e) => {
            if (!slugTouched) setSlug(toSlug(e.target.value));
          }}
        />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="slug">Web address</label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9\-]{0,59}"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <span className="hint">
            {p.urlPrefix}/p/{slug || '…'}
          </span>
        </div>
        <div className="field">
          <label htmlFor="sortOrder">Order</label>
          <input id="sortOrder" name="sortOrder" type="number" min={0} max={1000} defaultValue={d.sortOrder} />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" name="showToc" defaultChecked={d.showToc} />
        Show a table of contents (built from the headings; good for long pages like a handbook)
      </label>
      <MarkdownField name="body" label="Content" defaultValue={d.body} rows={20} maxLength={400_000} />
      {p.audiencePicker}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" name="then" value="" disabled={pending}>
          Save draft
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
