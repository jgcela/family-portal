'use client';
import { useActionState } from 'react';
import { toggleModuleAction, type ToggleState } from './actions';

export function ModuleToggle({ tenantKey, moduleId, name, enabled }: { tenantKey: string; moduleId: string; name: string; enabled: boolean }) {
  const [state, run, pending] = useActionState<ToggleState>(() => toggleModuleAction(tenantKey, moduleId, !enabled), undefined);
  return (
    <form action={run}>
      <button className={`btn btn-sm ${enabled ? 'btn-quiet' : 'btn-primary'}`} type="submit" disabled={pending} aria-label={`${enabled ? 'Turn off' : 'Turn on'} ${name}`}>
        {enabled ? 'Turn off' : 'Turn on'}
      </button>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
