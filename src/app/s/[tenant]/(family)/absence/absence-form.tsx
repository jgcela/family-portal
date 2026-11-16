'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { absenceAction } from '../requests/actions';

type Child = { id: string; name: string; grade: string | null };

export function AbsenceForm({ tenantKey, base, children: kids, idempotencyKey, today }: { tenantKey: string; base: string; children: Child[]; idempotencyKey: string; today: string }) {
  const [state, action, pending] = useActionState(absenceAction.bind(null, tenantKey), undefined);
  const [type, setType] = useState('absent');
  if (state?.ok) {
    return (
      <div className="ops-receipt" role="status">
        <h2>{state.ok}</h2>
        <p>You can follow it, add a message or cancel it from your requests.</p>
        <p className="btn-row">
          {state.id && (
            <Link className="btn btn-primary" href={`${base}/requests/${state.id}`}>
              See the notice
            </Link>
          )}
          <a className="btn btn-quiet" href={`${base}/absence`}>
            Report another
          </a>
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="ops-form">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="field">
        <label htmlFor="studentId">Child</label>
        <select id="studentId" name="studentId" required defaultValue={kids.length === 1 ? kids[0]!.id : ''}>
          {kids.length > 1 && <option value="">Choose…</option>}
          {kids.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.grade ? ` (${c.grade})` : ''}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field">
        <legend>What is happening?</legend>
        {[
          ['absent', 'Absent'],
          ['late', 'Arriving late'],
          ['early_dismissal', 'Leaving early'],
        ].map(([v, l]) => (
          <label key={v} className="check">
            <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v!)} /> {l}
          </label>
        ))}
      </fieldset>
      <div className="ops-row">
        <div className="field">
          <label htmlFor="dateFrom">{type === 'absent' ? 'First day' : 'Date'}</label>
          <input id="dateFrom" name="dateFrom" type="date" required defaultValue={today} />
        </div>
        {type === 'absent' ? (
          <div className="field">
            <label htmlFor="dateTo">Last day (optional)</label>
            <input id="dateTo" name="dateTo" type="date" />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="time">{type === 'late' ? 'Expected arrival time' : 'Pick-up time'}</label>
            <input id="time" name="time" type="time" required />
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="reason">Reason</label>
        <select id="reason" name="reason" required defaultValue="">
          <option value="">Choose…</option>
          <option value="illness">Illness</option>
          <option value="medical_appointment">Medical appointment</option>
          <option value="family">Family reason</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="comment">Comment for the office (optional)</label>
        <textarea id="comment" name="comment" rows={3} maxLength={500} />
        <span className="hint">Please don&apos;t include medical details or diagnoses. The office will contact you if it needs more.</span>
      </div>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send notice'}
        </button>
      </div>
    </form>
  );
}
