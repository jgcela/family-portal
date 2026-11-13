'use client';
import { useActionState } from 'react';
import type { FamilyResult } from './actions';

type Grade = { id: string; name: string };

/** Grade checkboxes plus a submit button; used to approve requests and to edit a family's grades. */
export function GradesForm({ run, grades, selected, submitLabel }: { run: (p: FamilyResult, fd: FormData) => Promise<FamilyResult>; grades: Grade[]; selected: string[]; submitLabel: string }) {
  const [state, action, pending] = useActionState(run, undefined);
  return (
    <form action={action} className="family-grades">
      <div className="grade-chips" role="group" aria-label="Grades">
        {grades.map((g) => (
          <label key={g.id} className="grade-chip">
            <input type="checkbox" name="gradeIds" value={g.id} defaultChecked={selected.includes(g.id)} />
            <span>{g.name}</span>
          </label>
        ))}
      </div>
      <div className="inline-action">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        {state?.error && (
          <span className="field-error" role="alert">
            {state.error}
          </span>
        )}
        {state?.ok && <span className="muted">{state.ok}</span>}
      </div>
    </form>
  );
}
