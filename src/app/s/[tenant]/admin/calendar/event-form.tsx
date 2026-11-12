'use client';
import { useActionState, useState } from 'react';
import { saveEventAction, type FormState } from './actions';

export type EventFormDefaults = {
  calendarId: string;
  title: string;
  description: string;
  location: string;
  category: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  rrule: string;
  exdates: string;
  registrationUrl: string;
  audienceIds: string[];
  isImportant: boolean;
};

type Props = {
  tenantKey: string;
  eventId: string | null;
  defaults: EventFormDefaults;
  calendars: { id: string; name: string }[];
  audiences: { id: string; name: string; kind: string }[];
  categories: string[];
  canPublish: boolean;
  requireApproval: boolean;
  /** Current workflow status; null for a new event. */
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived' | null;
};

const DAYS = [
  ['MO', 'Mon'],
  ['TU', 'Tue'],
  ['WE', 'Wed'],
  ['TH', 'Thu'],
  ['FR', 'Fri'],
  ['SA', 'Sat'],
  ['SU', 'Sun'],
] as const;

/** Splits a rule into the simple controls, or reports it as custom. */
function readRule(rule: string) {
  if (!rule) return { repeat: 'none', interval: '1', byday: [] as string[], until: '', count: '' };
  const p = Object.fromEntries(rule.split(';').map((kv) => kv.split('=') as [string, string]));
  const simple =
    ['DAILY', 'WEEKLY', 'MONTHLY'].includes(p.FREQ ?? '') &&
    Object.keys(p).every((k) => ['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT'].includes(k)) &&
    (!p.BYDAY || (p.FREQ === 'WEEKLY' && /^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/.test(p.BYDAY)));
  if (!simple) return { repeat: 'custom', interval: '1', byday: [], until: '', count: '' };
  const u = p.UNTIL ?? '';
  return {
    repeat: p.FREQ!.toLowerCase(),
    interval: p.INTERVAL ?? '1',
    byday: p.BYDAY ? p.BYDAY.split(',') : [],
    until: u ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : '',
    count: p.COUNT ?? '',
  };
}

export function EventForm(p: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEventAction.bind(null, p.tenantKey, p.eventId), undefined);
  const d = p.defaults;
  const isPublished = p.status === 'published';
  const editable = p.status === null || p.status === 'draft';
  const showPublish = p.canPublish && (p.requireApproval ? p.status === 'approved' : editable || p.status === 'approved');
  const showSubmit = p.requireApproval && editable;
  const [allDay, setAllDay] = useState(d.allDay);
  const initial = readRule(d.rrule);
  const [repeat, setRepeat] = useState(initial.repeat);
  const [ends, setEnds] = useState(initial.count ? 'count' : 'until');

  return (
    <form action={action} className="form" noValidate={false}>
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={300} defaultValue={d.title} />
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="calendarId">Calendar</label>
          <select id="calendarId" name="calendarId" defaultValue={d.calendarId} required>
            {p.calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <input id="category" name="category" list="category-options" maxLength={40} defaultValue={d.category} />
          <datalist id="category-options">
            {p.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="hint">Used for colors and filters, e.g. noclasses, faith, academic.</span>
        </div>
      </div>

      <label className="check">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All-day event
      </label>

      <div className="form-row">
        <div className="field">
          <label htmlFor="startDate">Starts</label>
          <input id="startDate" name="startDate" type="date" required defaultValue={d.startDate} />
        </div>
        {!allDay && (
          <div className="field">
            <label htmlFor="startTime">Start time</label>
            <input id="startTime" name="startTime" type="time" required defaultValue={d.startTime} />
          </div>
        )}
        <div className="field">
          <label htmlFor="endDate">Ends</label>
          <input id="endDate" name="endDate" type="date" defaultValue={d.endDate} />
          <span className="hint">Leave empty for a single day.</span>
        </div>
        {!allDay && (
          <div className="field">
            <label htmlFor="endTime">End time</label>
            <input id="endTime" name="endTime" type="time" defaultValue={d.endTime} />
          </div>
        )}
      </div>
      <input type="hidden" name="timezone" value={d.timezone} />
      <p className="hint muted" style={{ marginTop: 'calc(var(--space-3) * -1)' }}>
        Times are in {d.timezone.replace('_', ' ')}.
      </p>

      <fieldset className="field">
        <legend>Repeats</legend>
        <div className="form-row">
          <div className="field">
            <label htmlFor="repeat" className="visually-hidden">
              Repeats
            </label>
            <select id="repeat" name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly (same date)</option>
              <option value="custom">Custom rule (advanced)</option>
            </select>
          </div>
          {['daily', 'weekly', 'monthly'].includes(repeat) && (
            <div className="field">
              <label htmlFor="interval">Every</label>
              <input id="interval" name="interval" type="number" min={1} max={52} defaultValue={initial.interval} />
            </div>
          )}
        </div>
        {repeat === 'weekly' && (
          <div className="chip-row" role="group" aria-label="On these days">
            {DAYS.map(([v, l]) => (
              <label key={v} className="check">
                <input type="checkbox" name="byday" value={v} defaultChecked={initial.byday.includes(v)} />
                {l}
              </label>
            ))}
          </div>
        )}
        {['daily', 'weekly', 'monthly'].includes(repeat) && (
          <div className="form-row">
            <div className="field">
              <label htmlFor="ends">Ends</label>
              <select id="ends" value={ends} onChange={(e) => setEnds(e.target.value)}>
                <option value="until">On a date</option>
                <option value="count">After a number of times</option>
              </select>
            </div>
            {ends === 'until' ? (
              <div className="field">
                <label htmlFor="until">Last date</label>
                <input id="until" name="until" type="date" required defaultValue={initial.until} />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="count">Times</label>
                <input id="count" name="count" type="number" min={1} max={500} required defaultValue={initial.count || '10'} />
              </div>
            )}
          </div>
        )}
        {repeat === 'custom' && (
          <div className="field">
            <label htmlFor="rrule">Recurrence rule (RFC 5545)</label>
            <input id="rrule" name="rrule" defaultValue={d.rrule} placeholder="FREQ=WEEKLY;BYDAY=FR;UNTIL=20270528" />
          </div>
        )}
        {repeat !== 'none' && (
          <div className="field">
            <label htmlFor="exdates">Skip these dates</label>
            <input id="exdates" name="exdates" defaultValue={d.exdates} placeholder="2026-11-27, 2026-12-25" />
            <span className="hint">Dates in YYYY-MM-DD format, separated by commas.</span>
          </div>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="location">Location</label>
        <input id="location" name="location" maxLength={500} defaultValue={d.location} />
      </div>
      <div className="field">
        <label htmlFor="description">Details</label>
        <textarea id="description" name="description" maxLength={5000} defaultValue={d.description} />
      </div>
      <div className="field">
        <label htmlFor="registrationUrl">Sign-up or info link</label>
        <input id="registrationUrl" name="registrationUrl" type="url" placeholder="https://" defaultValue={d.registrationUrl} />
      </div>

      <fieldset className="field">
        <legend>Who is it for?</legend>
        <span className="hint">Leave everything unchecked for the whole school.</span>
        <div className="check-grid">
          {p.audiences.map((x) => (
            <label key={x.id} className="check">
              <input type="checkbox" name="audienceIds" value={x.id} defaultChecked={d.audienceIds.includes(x.id)} />
              {x.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="check">
        <input type="checkbox" name="isImportant" defaultChecked={d.isImportant} />
        Highlight as important
      </label>

      <div className="form-actions">
        <button className="btn btn-primary" type="submit" name="then" value="" disabled={pending}>
          {isPublished ? 'Save changes' : p.status === null || p.status === 'draft' ? 'Save draft' : 'Save'}
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
