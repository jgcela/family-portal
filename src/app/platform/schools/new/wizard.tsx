'use client';
import Link from 'next/link';
import { useActionState, useMemo, useRef, useState, startTransition } from 'react';
import { readableOn } from '@/server/theme/contrast';
import type { PlatformResult } from '../../_components/actions-shared';

type Plan = { id: string; name: string; description: string | null; includedModules: string[] };
type Mod = { id: string; name: string; description: string };
type Structure = { id: string; label: string; grades: { code: string; name: string }[] };

const STEPS = ['School', 'Brand', 'Year & grades', 'Administrator', 'Plan & modules', 'Review'] as const;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

function nextSchoolYear() {
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return { label: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, start: `${y}-08-15`, end: `${y + 1}-05-31` };
}

export function NewSchoolWizard({
  run,
  plans,
  modules,
  structures,
  addressPattern,
}: {
  run: (prev: PlatformResult, input: unknown) => Promise<PlatformResult>;
  plans: Plan[];
  modules: Mod[];
  structures: Structure[];
  addressPattern: string;
}) {
  const [state, action, pending] = useActionState(run, undefined);
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const year = useMemo(nextSchoolYear, []);
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone').filter((z) => z.includes('/')), []);
  const [v, setV] = useState({
    name: '',
    shortName: '',
    slug: '',
    timezone: 'America/Denver',
    phone: '',
    email: '',
    website: '',
    primaryColor: '#1F3A5F',
    accentColor: '#E0A100',
    yearLabel: year.label,
    yearStart: year.start,
    yearEnd: year.end,
    gradeStructure: structures[0]?.id ?? 'pk-8',
    excludeGrades: [] as string[],
    adminName: '',
    adminEmail: '',
    planId: plans[0]?.id ?? '',
    subscriptionStatus: 'trialing',
    trialDays: 30,
    modules: [] as string[],
  });
  const stepRef = useRef<HTMLFieldSetElement>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const plan = plans.find((p) => p.id === v.planId);
  const available = modules.filter((m) => plan?.includedModules.includes(m.id));
  const structure = structures.find((s) => s.id === v.gradeStructure);
  const address = addressPattern === '/s/' ? `/s/${v.slug || 'school'}` : `${v.slug || 'school'}${addressPattern}`;

  if (state?.link && state.schoolId) {
    return (
      <div className="wizard">
        <div className="notice notice-ok invite-link" role="status">
          <p>
            <strong>{state.ok}</strong> Send this link to the administrator. It makes them School Owner, works once and
            expires in 7 days. For security it is shown only now; you can issue a new one from the school page.
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
        <p>
          <Link className="btn btn-primary" href={`/platform/schools/${state.schoolId}`}>
            Open the school page
          </Link>
        </p>
      </div>
    );
  }

  const next = () => {
    if (stepRef.current) {
      const fields = Array.from(stepRef.current.querySelectorAll('input, select')) as (HTMLInputElement | HTMLSelectElement)[];
      for (const f of fields) if (!f.reportValidity()) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    const modulesInPlan = v.modules.filter((m) => available.some((a) => a.id === m));
    startTransition(() => action({ ...v, modules: modulesInPlan }));
  };

  return (
    <form className="wizard" onSubmit={submit} noValidate={false}>
      <ol className="steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {state?.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
      <section className="panel">
        <fieldset ref={stepRef} className="panel-body wizard-step" style={{ border: 0, margin: 0 }}>
          <legend className="visually-hidden">{STEPS[step]}</legend>
          {step === 0 && (
            <>
              <h2>School identity</h2>
              <div className="field">
                <label htmlFor="name">School name</label>
                <input
                  id="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={v.name}
                  onChange={(e) => {
                    set('name', e.target.value);
                    if (!slugTouched) set('slug', slugify(e.target.value));
                  }}
                />
              </div>
              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="shortName">Short name (optional)</label>
                  <input id="shortName" maxLength={40} value={v.shortName} onChange={(e) => set('shortName', e.target.value)} />
                  <span className="hint">Used where space is tight, like the dashboard sidebar.</span>
                </div>
                <div className="field">
                  <label htmlFor="slug">Portal address</label>
                  <input
                    id="slug"
                    required
                    pattern="[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?"
                    title="Lowercase letters, numbers and dashes"
                    value={v.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set('slug', e.target.value.toLowerCase());
                    }}
                  />
                  <span className="hint">The portal will be at {address}. It can’t be changed later.</span>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="timezone">Time zone</label>
                  <select id="timezone" value={v.timezone} onChange={(e) => set('timezone', e.target.value)}>
                    {timezones.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                  <span className="hint">Event times are shown in this zone.</span>
                </div>
                <div className="field">
                  <label htmlFor="phone">Office phone (optional)</label>
                  <input id="phone" type="tel" maxLength={40} value={v.phone} onChange={(e) => set('phone', e.target.value)} />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="email">Office email (optional)</label>
                  <input id="email" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="website">School website (optional)</label>
                  <input id="website" type="url" pattern="https://.*" placeholder="https://" value={v.website} onChange={(e) => set('website', e.target.value)} />
                </div>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h2>Brand colours</h2>
              <p className="muted">
                The school can refine colours, fonts and add its logo later in Theme. Text and links are adjusted
                automatically so they stay readable.
              </p>
              <div className="form-row form-row-2">
                {(['primaryColor', 'accentColor'] as const).map((k) => (
                  <div className="field" key={k}>
                    <label htmlFor={k}>{k === 'primaryColor' ? 'Main colour' : 'Accent colour'}</label>
                    <div className="color-input" style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <input type="color" aria-label={`${k === 'primaryColor' ? 'Main' : 'Accent'} colour picker`} value={v[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} />
                      <input id={k} required pattern="#[0-9a-fA-F]{6}" title="A colour such as #16335B" value={v[k]} onChange={(e) => set(k, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
              {/^#[0-9a-fA-F]{6}$/.test(v.primaryColor) && /^#[0-9a-fA-F]{6}$/.test(v.accentColor) && (
                <div className="brand-sample" aria-label="Colour sample">
                  <div className="brand-sample-bar" style={{ background: v.primaryColor, color: readableOn(v.primaryColor) }}>
                    {v.shortName || v.name || 'School name'}
                  </div>
                  <span className="brand-sample-btn" style={{ background: v.accentColor, color: readableOn(v.accentColor) }}>
                    Add to calendar
                  </span>
                </div>
              )}
              <p className="muted">Logo upload is not available yet. Until then the portal shows the school name.</p>
            </>
          )}
          {step === 2 && (
            <>
              <h2>School year and grades</h2>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="yearLabel">School year</label>
                  <input id="yearLabel" required minLength={4} maxLength={20} value={v.yearLabel} onChange={(e) => set('yearLabel', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="yearStart">First day</label>
                  <input id="yearStart" type="date" required value={v.yearStart} onChange={(e) => set('yearStart', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="yearEnd">Last day</label>
                  <input id="yearEnd" type="date" required min={v.yearStart} value={v.yearEnd} onChange={(e) => set('yearEnd', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="gradeStructure">Grades the school has</label>
                <select
                  id="gradeStructure"
                  value={v.gradeStructure}
                  onChange={(e) => setV((s) => ({ ...s, gradeStructure: e.target.value, excludeGrades: [] }))}
                >
                  {structures.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="field">
                <legend>Untick any grade the school doesn’t have</legend>
                <div className="check-grid">
                  {structure?.grades.map((g) => (
                    <label key={g.code} className="check">
                      <input
                        type="checkbox"
                        checked={!v.excludeGrades.includes(g.code)}
                        onChange={(e) =>
                          set('excludeGrades', e.target.checked ? v.excludeGrades.filter((c) => c !== g.code) : [...v.excludeGrades, g.code])
                        }
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {step === 3 && (
            <>
              <h2>First administrator</h2>
              <p className="muted">
                This person becomes School Owner: they can add staff, set roles and run the portal. You’ll get an
                invitation link to send them; no email is sent automatically yet.
              </p>
              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="adminName">Name</label>
                  <input id="adminName" required maxLength={120} value={v.adminName} onChange={(e) => set('adminName', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="adminEmail">Email</label>
                  <input id="adminEmail" type="email" required value={v.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
                  <span className="hint">They must sign in with this email to accept.</span>
                </div>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <h2>Plan and modules</h2>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="planId">Plan</label>
                  <select id="planId" required value={v.planId} onChange={(e) => set('planId', e.target.value)}>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {plan?.description && <span className="hint">{plan.description}</span>}
                </div>
                <div className="field">
                  <label htmlFor="subscriptionStatus">Billing status</label>
                  <select id="subscriptionStatus" value={v.subscriptionStatus} onChange={(e) => set('subscriptionStatus', e.target.value)}>
                    <option value="trialing">Trial</option>
                    <option value="active">Active (paying)</option>
                    <option value="comped">Free (comped)</option>
                  </select>
                  <span className="hint">Recorded only. No payment is taken by the platform.</span>
                </div>
                {v.subscriptionStatus === 'trialing' && (
                  <div className="field">
                    <label htmlFor="trialDays">Trial length (days)</label>
                    <input id="trialDays" type="number" min={1} max={365} required value={v.trialDays} onChange={(e) => set('trialDays', Number(e.target.value))} />
                  </div>
                )}
              </div>
              <fieldset className="field">
                <legend>Switch on now</legend>
                {available.length === 0 ? (
                  <p className="muted">This plan includes only the home page.</p>
                ) : (
                  <div className="check-grid">
                    {available.map((m) => (
                      <label key={m.id} className="check" title={m.description}>
                        <input
                          type="checkbox"
                          checked={v.modules.includes(m.id)}
                          onChange={(e) => set('modules', e.target.checked ? [...v.modules, m.id] : v.modules.filter((x) => x !== m.id))}
                        />
                        {m.name}
                      </label>
                    ))}
                  </div>
                )}
                <span className="hint">The school can switch modules in its plan on and off later in Module Manager.</span>
              </fieldset>
            </>
          )}
          {step === 5 && (
            <>
              <h2>Review</h2>
              <dl className="review-list">
                <dt>School</dt>
                <dd>
                  {v.name}
                  {v.shortName ? ` (${v.shortName})` : ''}
                </dd>
                <dt>Address</dt>
                <dd>{address}</dd>
                <dt>Time zone</dt>
                <dd>{v.timezone}</dd>
                <dt>Colours</dt>
                <dd>
                  <span className="swatch swatch-lg" style={{ background: v.primaryColor }} />
                  {v.primaryColor} <span className="swatch swatch-lg" style={{ background: v.accentColor, marginLeft: 8 }} />
                  {v.accentColor}
                </dd>
                <dt>School year</dt>
                <dd>
                  {v.yearLabel}: {v.yearStart} to {v.yearEnd}
                </dd>
                <dt>Grades</dt>
                <dd>{structure?.grades.filter((g) => !v.excludeGrades.includes(g.code)).map((g) => g.code).join(', ')}</dd>
                <dt>Administrator</dt>
                <dd>
                  {v.adminName} · {v.adminEmail}
                </dd>
                <dt>Plan</dt>
                <dd>
                  {plan?.name} · {v.subscriptionStatus === 'trialing' ? `trial for ${v.trialDays} days` : v.subscriptionStatus === 'comped' ? 'free' : 'active'}
                </dd>
                <dt>Modules on</dt>
                <dd>{available.filter((m) => v.modules.includes(m.id)).map((m) => m.name).join(', ') || 'Home only'}</dd>
              </dl>
              <p className="muted">
                After creating it: send the invitation, let the administrator import the calendar and add content, then
                launch the school from its page. Custom domains come in a later step.
              </p>
            </>
          )}
        </fieldset>
      </section>
      <div className="wizard-nav">
        <button type="button" className="btn btn-quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {step < STEPS.length - 1 ? 'Continue' : pending ? 'Creating…' : 'Create school'}
        </button>
      </div>
    </form>
  );
}
