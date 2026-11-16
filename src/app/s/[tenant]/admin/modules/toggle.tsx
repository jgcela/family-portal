'use client';
import { useActionState, useOptimistic, startTransition } from 'react';
import { toggleModuleAction, type ToggleState } from './actions';

/** On/off switch for one module. Moves at once; goes back with a message if the server refuses. */
export function ModuleToggle({ tenantKey, moduleId, name, enabled }: { tenantKey: string; moduleId: string; name: string; enabled: boolean }) {
  const [on, setOn] = useOptimistic(enabled);
  const [state, run, pending] = useActionState<ToggleState>(() => toggleModuleAction(tenantKey, moduleId, !enabled), undefined);
  const errorId = `mod-err-${moduleId}`;
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
