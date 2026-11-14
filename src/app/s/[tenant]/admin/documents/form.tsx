'use client';
import { useActionState, useState } from 'react';
import { ACCEPT_ATTR, ALLOWED_DESCRIPTION } from '@/server/storage/files';
import { withDirectUpload, type StartUpload } from './direct-upload';

type Result = { error?: string; ok?: string } | undefined;
type Props = {
  run: (prev: Result, fd: FormData) => Promise<Result>;
  isNew: boolean;
  defaults: { title: string; slug: string; description: string; category: string };
  categories: string[];
  audiencePicker: React.ReactNode;
  linkPrefix: string;
  canPublish: boolean;
  requireApproval: boolean;
  maxMb: number;
  /** Files above this size go straight to storage (see direct-upload.ts). */
  inlineMaxBytes: number;
  startUpload: StartUpload;
};

type Run = (prev: Result, fd: FormData) => Promise<Result>;
const viaStorage = (run: Run, inlineMax: number, start: StartUpload): Run => async (prev, fd) => {
  const err = await withDirectUpload(fd, 'file', inlineMax, start);
  return err ? { error: err } : run(prev, fd);
};

const toSlug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export function DocumentForm(p: Props) {
  const [state, action, pending] = useActionState(viaStorage(p.run, p.inlineMaxBytes, p.startUpload), undefined);
  const d = p.defaults;
  const [title, setTitle] = useState(d.title);
  const [slug, setSlug] = useState(d.slug);
  const [slugTouched, setSlugTouched] = useState(!p.isNew);
  const [tooBig, setTooBig] = useState(false);
  return (
    <form action={action} className="form">
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
      {p.isNew && (
        <div className="field">
          <label htmlFor="file">File</label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept={ACCEPT_ATTR}
            aria-describedby="file-hint"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setTooBig(!!f && f.size > p.maxMb * 1048576);
              if (f && !title) setTitle(f.name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' '));
              if (f && !slugTouched) setSlug(toSlug(title || f.name));
            }}
          />
          <span className="hint" id="file-hint">
            {ALLOWED_DESCRIPTION}. Up to {p.maxMb} MB.
          </span>
          {tooBig && <span className="field-error">This file is larger than {p.maxMb} MB.</span>}
        </div>
      )}
      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(toSlug(e.target.value));
          }}
        />
      </div>
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="slug">Link name</label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9\-]{0,79}"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <span className="hint">
            {p.linkPrefix}/d/{slug || '…'}. This link keeps working when you upload a new version.
          </span>
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <input id="category" name="category" list="doc-categories" maxLength={60} defaultValue={d.category} placeholder="e.g. Forms, Policies" />
          <datalist id="doc-categories">
            {p.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">Description (optional)</label>
        <textarea id="description" name="description" maxLength={2000} rows={3} defaultValue={d.description} />
      </div>
      {p.audiencePicker}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" name="then" value="" disabled={pending || tooBig}>
          {p.isNew ? 'Upload as draft' : 'Save'}
        </button>
        {p.isNew && p.canPublish && !p.requireApproval && (
          <button className="btn btn-accent" type="submit" name="then" value="publish" disabled={pending || tooBig}>
            Upload and publish
          </button>
        )}
        {pending && <span className="muted">{p.isNew ? 'Uploading…' : 'Saving…'}</span>}
      </div>
    </form>
  );
}

export function UploadVersionForm({
  run,
  maxMb,
  inlineMaxBytes,
  startUpload,
}: {
  run: Run;
  maxMb: number;
  inlineMaxBytes: number;
  startUpload: StartUpload;
}) {
  const [state, action, pending] = useActionState(viaStorage(run, inlineMaxBytes, startUpload), undefined);
  const [tooBig, setTooBig] = useState(false);
  return (
    <form action={action} className="form" style={{ maxWidth: 560 }}>
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
      <div className="field">
        <label htmlFor="new-file">Replace with a new file</label>
        <input
          id="new-file"
          name="file"
          type="file"
          required
          accept={ACCEPT_ATTR}
          onChange={(e) => setTooBig((e.target.files?.[0]?.size ?? 0) > maxMb * 1048576)}
        />
        <span className="hint">The link stays the same. Earlier versions are kept and can be restored.</span>
        {tooBig && <span className="field-error">This file is larger than {maxMb} MB.</span>}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending || tooBig}>
          Upload new version
        </button>
        {pending && <span className="muted">Uploading…</span>}
      </div>
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy-link">
      <code>{url}</code>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </span>
  );
}
