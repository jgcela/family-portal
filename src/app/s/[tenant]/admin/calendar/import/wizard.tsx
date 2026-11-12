'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { commitImportAction, previewImportAction, type ImportState } from '../actions';

type Props = {
  tenantKey: string;
  base: string;
  calendars: { id: string; name: string }[];
  audiences: { id: string; name: string }[];
  timezone: string;
  canPublish: boolean;
  requireApproval: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Title *',
  startDate: 'Start date *',
  startTime: 'Start time',
  endDate: 'End date',
  endTime: 'End time',
  allDay: 'All day (yes/no)',
  location: 'Location',
  description: 'Details',
  category: 'Category',
  uid: 'Unique ID',
  url: 'Link',
};

const ACTION_LABEL = { new: 'New', update: 'Will update', unchanged: 'No change', duplicate: 'Possible duplicate', cancel: 'Cancelled in source' };

function fmtWhen(e: { allDay: boolean; startDate: string; endDate: string; startsAt: Date | string | null }, tz: string) {
  if (e.allDay) return e.endDate !== e.startDate ? `${e.startDate} → ${e.endDate}` : e.startDate;
  const d = new Date(e.startsAt!);
  return `${e.startDate} ${new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d)}`;
}

export function ImportWizard(p: Props) {
  // One state machine; the hidden _op field says which server action runs.
  const [current, run, pending] = useActionState<ImportState, FormData>(
    (prev, fd) => (fd.get('_op') === 'commit' ? commitImportAction(p.tenantKey, prev, fd) : previewImportAction(p.tenantKey, prev, fd)),
    { step: 'upload' },
  );
  const [showAll, setShowAll] = useState(false);
  const stepIdx = { upload: 0, map: 1, preview: 2, done: 3 }[current.step];

  return (
    <>
      <ol className="steps" aria-label="Import steps">
        {['Choose file', 'Match columns', 'Review', 'Done'].map((s, i) => (
          <li key={s} aria-current={i === stepIdx ? 'step' : undefined}>
            {s}
          </li>
        ))}
      </ol>

      {current.step === 'upload' && (
        <form action={run} className="form">
          {current.error && (
            <div className="notice notice-error" role="alert">
              {current.error}
            </div>
          )}
          <div className="field">
            <label htmlFor="file">Calendar file</label>
            <input id="file" name="file" type="file" accept=".ics,.csv,text/calendar,text/csv" required />
            <span className="hint">
              .ics from Google Calendar, Outlook or Apple Calendar, or a .csv spreadsheet. Up to about 4 MB. Nothing is saved until you
              confirm.
            </span>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="calendarId">Import into</label>
              <select id="calendarId" name="calendarId" required>
                {p.calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="timezone">Time zone for times without one</label>
              <input id="timezone" name="timezone" defaultValue={p.timezone} required />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'Reading file…' : 'Check file'}
            </button>
          </div>
        </form>
      )}

      {current.step === 'map' && (
        <form action={run} className="form">
          {current.error && (
            <div className="notice notice-error" role="alert">
              {current.error}
            </div>
          )}
          <p>
            Tell us which column holds each piece of information in <strong>{current.fileName}</strong>. We guessed where we could.
          </p>
          <input type="hidden" name="text" value={current.text} />
          <input type="hidden" name="fileName" value={current.fileName} />
          <input type="hidden" name="calendarId" value={current.calendarId} />
          <input type="hidden" name="timezone" value={current.timezone} />
          <div className="form-row">
            {Object.entries(FIELD_LABELS).map(([f, label]) => (
              <div className="field" key={f}>
                <label htmlFor={`map-${f}`}>{label}</label>
                <select id={`map-${f}`} name={`map:${f}`} defaultValue={current.mapping[f as keyof typeof current.mapping] ?? ''}>
                  <option value="">— Not in file —</option>
                  {current.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="hint muted">Dates: YYYY-MM-DD or M/D/YYYY. Times: 6:30 pm or 18:30. Rows without a time become all-day events.</p>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'Checking…' : 'Preview import'}
            </button>
          </div>
        </form>
      )}

      {current.step === 'preview' && (
        <form action={run} className="form" style={{ maxWidth: 'none' }}>
          <input type="hidden" name="_op" value="commit" />
          {current.error && (
            <div className="notice notice-error" role="alert">
              {current.error}
            </div>
          )}
          <dl className="stat-grid">
            <div className="stat">
              <dt>New events</dt>
              <dd>{current.preview.counts.new}</dd>
            </div>
            <div className="stat">
              <dt>Will update</dt>
              <dd>{current.preview.counts.update}</dd>
            </div>
            <div className="stat">
              <dt>Already up to date</dt>
              <dd>{current.preview.counts.unchanged}</dd>
            </div>
            <div className="stat">
              <dt>Possible duplicates</dt>
              <dd>{current.preview.counts.duplicate}</dd>
            </div>
            <div className="stat">
              <dt>Rows with errors</dt>
              <dd>{current.preview.errors.length}</dd>
            </div>
          </dl>
          {current.preview.counts.cancel > 0 && (
            <div className="notice">{current.preview.counts.cancel} event(s) are cancelled in the file and will be archived here.</div>
          )}
          {current.preview.errors.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Rows that will be skipped</h2>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.preview.errors.slice(0, 100).map((e) => (
                      <tr key={`${e.row}-${e.message}`}>
                        <td>{e.row || '—'}</td>
                        <td>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {current.preview.items.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Events in the file</h2>
                <label className="check">
                  <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                  Show unchanged
                </label>
              </div>
              <div className="table-wrap" style={{ maxHeight: 480 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Result</th>
                      <th scope="col">Event</th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.preview.items
                      .filter((i) => showAll || i.action !== 'unchanged')
                      .slice(0, 1000)
                      .map((i) => (
                        <tr key={`${i.row}-${i.uid}`}>
                          <td className="nowrap">
                            {i.action === 'duplicate' ? (
                              <label className="check">
                                <input type="checkbox" name="includeRow" value={i.row} />
                                Import anyway
                              </label>
                            ) : (
                              ACTION_LABEL[i.action]
                            )}
                            {i.action === 'duplicate' && <div className="muted">{ACTION_LABEL.duplicate}</div>}
                          </td>
                          <td>
                            {i.event.title}
                            {i.event.rrule && <div className="muted">Repeats</div>}
                          </td>
                          <td className="nowrap">{fmtWhen(i.event, i.event.timezone)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <fieldset className="field">
            <legend>Who are these events for?</legend>
            <span className="hint">Applies to new events. Leave unchecked for the whole school.</span>
            <div className="check-grid">
              {p.audiences.map((x) => (
                <label key={x.id} className="check">
                  <input type="checkbox" name="audienceIds" value={x.id} />
                  {x.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>Status of new events</legend>
            <label className="check">
              <input type="radio" name="status" value="draft" defaultChecked />
              Drafts (review them before families see them)
            </label>
            {p.canPublish && !p.requireApproval && (
              <label className="check">
                <input type="radio" name="status" value="published" />
                Published right away
              </label>
            )}
          </fieldset>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={pending || current.preview.items.length === 0}>
              {pending ? 'Importing…' : 'Import events'}
            </button>
            <a href={`${p.base}/admin/calendar/import`} className="btn btn-quiet">
              Start over
            </a>
          </div>
        </form>
      )}

      {current.step === 'done' && (
        <div className="form">
          <div className="notice notice-ok" role="status">
            Import finished: {current.result.created} created, {current.result.updated} updated, {current.result.cancelled} archived,{' '}
            {current.result.skipped} skipped.
          </div>
          <div className="form-actions">
            <Link href={`${p.base}/admin/calendar`} className="btn btn-primary">
              Go to events
            </Link>
            <a href={`${p.base}/admin/calendar/import`} className="btn btn-quiet">
              Import another file
            </a>
          </div>
        </div>
      )}
    </>
  );
}
