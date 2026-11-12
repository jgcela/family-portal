'use client';
import { useActionState } from 'react';
import { saveCalendarAction, type FormState } from '../actions';

type Cal = { id: string; key: string; name: string; description: string | null; color: string; isPublic: boolean; sortOrder: number };

export function CalendarForm({ tenantKey, cal }: { tenantKey: string; cal: Cal | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCalendarAction.bind(null, tenantKey, cal?.id ?? null), undefined);
  const id = cal?.id ?? 'new';
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
      <div className="form-row">
        <div className="field">
          <label htmlFor={`name-${id}`}>Name</label>
          <input id={`name-${id}`} name="name" required maxLength={80} defaultValue={cal?.name ?? ''} />
        </div>
        {!cal && (
          <div className="field">
            <label htmlFor={`key-${id}`}>Short name for links</label>
            <input id={`key-${id}`} name="key" required pattern="[a-z0-9][a-z0-9-]{0,39}" placeholder="sports" />
            <span className="hint">Lowercase, numbers and hyphens. Used in the subscription link; cannot change later.</span>
          </div>
        )}
        <div className="field">
          <label htmlFor={`color-${id}`}>Color</label>
          <input id={`color-${id}`} name="color" type="color" defaultValue={cal?.color ?? '#1F3A5F'} />
        </div>
        <div className="field">
          <label htmlFor={`order-${id}`}>Order</label>
          <input id={`order-${id}`} name="sortOrder" type="number" min={0} max={1000} defaultValue={cal?.sortOrder ?? 0} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`desc-${id}`}>Description</label>
        <input id={`desc-${id}`} name="description" maxLength={500} defaultValue={cal?.description ?? ''} />
      </div>
      <label className="check">
        <input type="checkbox" name="isPublic" defaultChecked={cal?.isPublic ?? true} />
        Families can see this calendar and subscribe to it
      </label>
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {cal ? 'Save calendar' : 'Create calendar'}
        </button>
      </div>
    </form>
  );
}
