'use client';
import { useActionState, useState } from 'react';
import type { PlatformResult } from '../../_components/actions-shared';

type Run = (p: PlatformResult, fd: FormData) => Promise<PlatformResult>;

function Message({ state }: { state: PlatformResult }) {
  if (state?.error)
    return (
      <span className="field-error" role="alert">
        {state.error}
      </span>
    );
  if (state?.ok) return <span className="muted" role="status">{state.ok}</span>;
  return null;
}

/** Launch / suspend / reactivate. Suspending asks for a reason and a second click. */
export function StatusForm({ run, label, danger = false, needsReason = false, help }: { run: Run; label: string; danger?: boolean; needsReason?: boolean; help: string }) {
  const [state, action, pending] = useActionState(run, undefined);
  const [armed, setArmed] = useState(false);
  return (
    <form action={action} className="form">
      <p className="muted">{help}</p>
      {needsReason && armed && (
        <div className="field">
          <label htmlFor="reason">Reason (kept in the activity log)</label>
          <input id="reason" name="reason" required maxLength={300} />
        </div>
      )}
      <div className="form-actions">
        {danger && !armed ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setArmed(true)}>
            {label}
          </button>
        ) : (
          <>
            <button type="submit" className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={pending}>
              {danger ? `Confirm: ${label.toLowerCase()}` : label}
            </button>
            {danger && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setArmed(false)}>
                Cancel
              </button>
            )}
          </>
        )}
        <Message state={state} />
      </div>
    </form>
  );
}

type Plan = { id: string; name: string; includedModules: string[] };
type Mod = { id: string; name: string };

export function SubscriptionForm({
  run,
  plans,
  modules,
  current,
}: {
  run: Run;
  plans: Plan[];
  modules: Mod[];
  current: { planId: string; status: string; extraModules: string[]; trialEndsAt: string; renewsAt: string };
}) {
  const [state, action, pending] = useActionState(run, undefined);
  const [planId, setPlanId] = useState(current.planId);
  const [status, setStatus] = useState(current.status);
  const plan = plans.find((p) => p.id === planId);
  const extras = modules.filter((m) => !plan?.includedModules.includes(m.id));
  return (
    <form action={action} className="form">
      <div className="form-row">
        <div className="field">
          <label htmlFor="planId">Plan</label>
          <select id="planId" name="planId" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Billing status</label>
          <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="trialing">Trial</option>
            <option value="active">Active (paying)</option>
            <option value="past_due">Payment overdue</option>
            <option value="comped">Free (comped)</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
        {status === 'trialing' && (
          <div className="field">
            <label htmlFor="trialEndsAt">Trial ends</label>
            <input id="trialEndsAt" name="trialEndsAt" type="date" required defaultValue={current.trialEndsAt} />
          </div>
        )}
        <div className="field">
          <label htmlFor="renewsAt">Renews (optional)</label>
          <input id="renewsAt" name="renewsAt" type="date" defaultValue={current.renewsAt} />
        </div>
      </div>
      {status === 'canceled' && (
        <p className="notice notice-error">A canceled school keeps its data but can only use the home page.</p>
      )}
      <fieldset className="field">
        <legend>Included in {plan?.name}</legend>
        <p className="muted" style={{ margin: 0 }}>
          {modules.filter((m) => plan?.includedModules.includes(m.id)).map((m) => m.name).join(', ') || 'Home page only'}
        </p>
      </fieldset>
      {extras.length > 0 && (
        <fieldset className="field">
          <legend>Extra modules for this school</legend>
          <div className="check-grid">
            {extras.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" name="extraModules" value={m.id} defaultChecked={current.extraModules.includes(m.id)} />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="muted">
        Removing a module hides it from the school; nothing is deleted. Payments are not taken here: this records what
        was agreed.
      </p>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save plan'}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function OwnerInviteForm({ run }: { run: Run }) {
  const [state, action, pending] = useActionState(run, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="form">
      {state?.link && (
        <div className="notice notice-ok invite-link" role="status">
          <p>
            <strong>Invitation created.</strong> Send this link to the person. It makes them School Owner, works once,
            expires in 7 days and is shown only now.
          </p>
          <code>{state.link}</code>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      <form
        action={(fd) => {
          setCopied(false);
          action(fd);
        }}
        className="form"
      >
        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="invite-name">Name</label>
            <input id="invite-name" name="name" required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="invite-email">Email</label>
            <input id="invite-email" name="email" type="email" required />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-quiet btn-sm" disabled={pending}>
            {pending ? 'Creating…' : 'Create owner invitation'}
          </button>
          {state?.error && (
            <span className="field-error" role="alert">
              {state.error}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

export function RevokeButton({ run }: { run: () => Promise<PlatformResult> }) {
  const [state, action, pending] = useActionState<PlatformResult>(run, undefined);
  return (
    <form action={action} className="inline-action">
      <button type="submit" className="btn btn-quiet btn-sm" disabled={pending}>
        Cancel invitation
      </button>
      <Message state={state} />
    </form>
  );
}
