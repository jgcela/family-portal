'use client';
import { useActionState, useState } from 'react';
import { addIssueAction, importIssueAction, updateIssueAction } from './actions';

type Result = { error?: string; ok?: string } | undefined;

function Visibility({ value }: { value: string }) {
  return (
    <div className="field">
      <label htmlFor="visibility">Who can see it</label>
      <select id="visibility" name="visibility" defaultValue={value}>
        <option value="public">Everyone (public)</option>
        <option value="families">Families (signed in)</option>
        <option value="staff">Staff only</option>
      </select>
    </div>
  );
}

function Notice({ state }: { state: Result }) {
  if (state?.error)
    return (
      <div className="notice notice-error" role="alert">
        {state.error}
      </div>
    );
  if (state?.ok)
    return (
      <div className="notice notice-ok" role="status">
        {state.ok}
      </div>
    );
  return null;
}

export function AddIssueForm({ tenantKey }: { tenantKey: string }) {
  const [state, action, pending] = useActionState<Result, FormData>(addIssueAction.bind(null, tenantKey), undefined);
  return (
    <form action={action} className="form">
      <Notice state={state} />
      <div className="form-row form-row-2">
        <div className="field">
          <label htmlFor="issueDate">Date</label>
          <input id="issueDate" name="issueDate" type="date" required />
          <span className="hint">An issue with the same date is replaced.</span>
        </div>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required maxLength={200} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="file">Newsletter (.html)</label>
        <input id="file" name="file" type="file" accept=".html,.htm,text/html" required />
        <span className="hint">The email saved as a web page. Scripts, forms, tracking images and the email footer are removed.</span>
      </div>
      <div className="field">
        <label htmlFor="excerpt">Summary</label>
        <textarea id="excerpt" name="excerpt" maxLength={1000} rows={3} />
      </div>
      <div className="field">
        <label htmlFor="highlights">Highlights</label>
        <textarea id="highlights" name="highlights" rows={4} placeholder={'Nov 13 — End of 1st Trimester\nNov 20 — All School Mass'} />
        <span className="hint">One per line, up to 20.</span>
      </div>
      <Visibility value="public" />
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Add issue
        </button>
        {pending && <span className="muted">Saving…</span>}
      </div>
    </form>
  );
}

export function EditIssueForm(p: {
  tenantKey: string;
  id: string;
  defaults: { title: string; excerpt: string; highlights: string[]; visibility: string; isActive: boolean };
}) {
  const [state, action, pending] = useActionState<Result, FormData>(updateIssueAction.bind(null, p.tenantKey, p.id), undefined);
  const d = p.defaults;
  return (
    <form action={action} className="form">
      <Notice state={state} />
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={200} defaultValue={d.title} />
      </div>
      <div className="field">
        <label htmlFor="excerpt">Summary</label>
        <textarea id="excerpt" name="excerpt" maxLength={1000} rows={3} defaultValue={d.excerpt} />
      </div>
      <div className="field">
        <label htmlFor="highlights">Highlights</label>
        <textarea id="highlights" name="highlights" rows={4} defaultValue={d.highlights.join('\n')} />
        <span className="hint">One per line, up to 20.</span>
      </div>
      <Visibility value={d.visibility} />
      <label className="check">
        <input type="checkbox" name="isActive" defaultChecked={d.isActive} />
        Show it
      </label>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Save changes
        </button>
        {pending && <span className="muted">Saving…</span>}
      </div>
    </form>
  );
}

/** Reads an archive file in the browser and sends its issues one by one. */
export function ImportIssuesForm({ tenantKey }: { tenantKey: string }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<Result>(undefined);

  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setLog([]);
    setSummary(undefined);
    let issues: unknown[] = [];
    try {
      const data = JSON.parse(await file.text());
      issues = Array.isArray(data?.issues) ? data.issues : [];
    } catch {
      setSummary({ error: 'The file is not valid JSON.' });
      setBusy(false);
      return;
    }
    if (!issues.length || issues.length > 300) {
      setSummary({ error: 'The file must look like { "issues": [ … ] } with 1 to 300 issues.' });
      setBusy(false);
      return;
    }
    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const [n, issue] of issues.entries()) {
      const label = (issue as { issueDate?: string; title?: string })?.issueDate ?? `Issue ${n + 1}`;
      const r = await importIssueAction(tenantKey, issue);
      if (r.error) failed++;
      else if (r.created) created++;
      else updated++;
      setLog((l) => [...l, r.error ? `${label}: ${r.error}` : `${label}: ${r.created ? 'added' : 'updated'}`]);
    }
    const text = `${created} added, ${updated} updated${failed ? `, ${failed} failed` : ''}.`;
    setSummary(failed ? { error: text } : { ok: text });
    setBusy(false);
  }

  return (
    <form onSubmit={run} className="form">
      <Notice state={summary} />
      <div className="field">
        <label htmlFor="import-file">File (.json)</label>
        <input id="import-file" name="file" type="file" accept=".json,application/json" required />
        <span className="hint">Issues are sent one at a time. An issue whose date already exists is replaced, so the same file can be loaded twice.</span>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Import
        </button>
        {busy && (
          <span className="muted" role="status">
            Importing {log.length + 1}…
          </span>
        )}
      </div>
      {log.length > 0 && (
        <ul className="muted" aria-label="Import progress">
          {log.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
