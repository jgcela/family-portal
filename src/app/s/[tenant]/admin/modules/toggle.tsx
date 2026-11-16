'use client';
import { useActionState, useOptimistic, startTransition } from 'react';
import { toggleModuleAction, type ToggleState } from './actions';

/** On/off switch for one module. Moves at once; goes back with a message if the server refuses. */
export function ModuleToggle({
  tenantKey,
  moduleId,
  name,
  enabled,
  blockedReason,
}: {
  tenantKey: string;
  moduleId: string;
  name: string;
  enabled: boolean;
  /** Set when the module cannot be switched on yet; the switch is shown disabled with this note. */
  blockedReason?: string;
}) {
  const [on, setOn] = useOptimistic(enabled);
  const [state, run, pending] = useActionState<ToggleState>(() => toggleModuleAction(tenantKey, moduleId, !enabled), undefined);
  const errorId = `mod-err-${moduleId}`;
  const noteId = `mod-note-${moduleId}`;
  if (blockedReason) {
    return (
      <div className="mod-toggle">
        <button type="button" role="switch" aria-checked={false} aria-label={name} aria-describedby={noteId} className="switch" disabled>
          <span className="switch-knob" aria-hidden="true" />
        </button>
        <p className="mod-note" id={noteId}>
          {blockedReason}
        </p>
      </div>
    );
  }
  return (
    <div className="mod-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={name}
        aria-describedby={state?.error ? errorId : undefined}
        className="switch"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          startTransition(() => {
            setOn(!enabled);
            run();
          })
        }
      >
        <span className="switch-knob" aria-hidden="true" />
      </button>
      {state?.error && (
        <p className="field-error" id={errorId} role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
