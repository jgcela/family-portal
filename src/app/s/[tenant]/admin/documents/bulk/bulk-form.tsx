'use client';
// Upload several files at once. Each file becomes its own document; titles
// come from the file names and can be changed before uploading. Files are sent
// one at a time, so a failure only affects that file.
import { useRef, useState } from 'react';
import { ACCEPT_ATTR, ALLOWED_DESCRIPTION } from '@/server/storage/files';
import { sendDirect, type StartUpload } from '../direct-upload';

type Item = { file: File; title: string; state: 'waiting' | 'sending' | 'done' | 'error'; message?: string; id?: string };

/** "2026-27_Milk_Order_Form.pdf" → "2026-27 Milk Order Form" */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/_+/g, ' ')
    .replace(/(?<!\d)-+|-+(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

const toSlug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document';

export function BulkUploadForm(p: {
  create: (fd: FormData) => Promise<{ id?: string; error?: string }>;
  startUpload: StartUpload;
  inlineMaxBytes: number;
  maxBytes: number;
  categories: string[];
  audiencePicker: React.ReactNode;
  canPublish: boolean;
  docBase: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const update = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function run(then: '' | 'publish') {
    if (!form.current) return;
    setRunning(true);
    const shared = new FormData(form.current);
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.state === 'done') continue;
      if (it.file.size > p.maxBytes) {
        update(i, { state: 'error', message: `Larger than ${p.maxBytes / 1048576} MB.` });
        continue;
      }
      update(i, { state: 'sending', message: undefined });
      const fd = new FormData();
      fd.set('title', it.title.trim() || titleFromFileName(it.file.name));
      fd.set('slug', toSlug(it.title || it.file.name));
      fd.set('category', String(shared.get('category') ?? ''));
      fd.set('description', '');
      fd.set('visibility', String(shared.get('visibility') ?? 'public'));
      for (const a of shared.getAll('audienceIds')) fd.append('audienceIds', a);
      fd.set('then', then);
      if (it.file.size > p.inlineMaxBytes) {
        const r = await sendDirect(it.file, p.startUpload);
        if ('error' in r) {
          update(i, { state: 'error', message: r.error });
          continue;
        }
        fd.set('uploadToken', r.token);
        fd.set('uploadName', it.file.name);
      } else {
        fd.set('file', it.file);
      }
      try {
        const res = await p.create(fd);
        update(i, res.error ? { state: 'error', message: res.error } : { state: 'done', id: res.id });
      } catch {
        update(i, { state: 'error', message: 'The upload stopped. Try again.' });
      }
    }
    setRunning(false);
  }

  const pending = items.filter((x) => x.state !== 'done').length;
  const done = items.filter((x) => x.state === 'done').length;

  return (
    <form ref={form} className="form" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor="files">Files</label>
        <input
          id="files"
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          disabled={running}
          aria-describedby="files-hint"
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            setItems((xs) => [...xs.filter((x) => x.state !== 'done'), ...fs.map((file) => ({ file, title: titleFromFileName(file.name), state: 'waiting' as const }))]);
            e.target.value = '';
          }}
        />
        <span className="hint" id="files-hint">
          {ALLOWED_DESCRIPTION}. Up to {p.maxBytes / 1048576} MB each. You can pick files more than once to add to the list.
        </span>
      </div>

      {items.length > 0 && (
        <ul className="bulk-list" aria-label="Files to upload">
          {items.map((it, i) => (
            <li key={`${it.file.name}-${i}`} className="bulk-item">
              <input
                aria-label={`Title for ${it.file.name}`}
                value={it.title}
                maxLength={200}
                disabled={running || it.state === 'done'}
                onChange={(e) => update(i, { title: e.target.value })}
              />
              <span className={`bulk-state${it.state === 'done' ? ' is-ok' : it.state === 'error' ? ' is-error' : ''}`} role="status">
                {it.state === 'waiting' && (
                  <button type="button" className="btn btn-quiet btn-sm" disabled={running} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
                {it.state === 'sending' && 'Uploading…'}
                {it.state === 'done' && it.id && <a href={`${p.docBase}/${it.id}`}>Uploaded</a>}
                {it.state === 'error' && it.message}
              </span>
              <span className="bulk-meta">
                {it.file.name} · {(it.file.size / 1048576).toFixed(1)} MB
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label htmlFor="category">Category for these files</label>
        <input id="category" name="category" list="doc-categories" maxLength={60} placeholder="e.g. Forms to return" disabled={running} />
        <datalist id="doc-categories">
          {p.categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <span className="hint">Upload one category at a time, or leave it empty and set it on each document later.</span>
      </div>
      {p.audiencePicker}

      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={running || pending === 0} onClick={() => run('')}>
          Upload {pending || ''} as drafts
        </button>
        {p.canPublish && (
          <button className="btn btn-accent" type="button" disabled={running || pending === 0} onClick={() => run('publish')}>
            Upload and publish
          </button>
        )}
        {running && <span className="muted">Uploading one at a time. Keep this page open.</span>}
        {!running && done > 0 && (
          <span className="muted" role="status">
            {done} uploaded.
          </span>
        )}
      </div>
    </form>
  );
}
