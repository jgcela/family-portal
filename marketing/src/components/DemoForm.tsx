'use client';
import { useState } from 'react';
import { brand, demo } from '@/config/site';

type Errors = Partial<Record<'name' | 'email' | 'school', string>>;
type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'ok' } | { kind: 'error'; message: string } | { kind: 'mail' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(fd: FormData): Errors {
  const e: Errors = {};
  if (!String(fd.get('name') ?? '').trim()) e.name = 'Enter your name.';
  const email = String(fd.get('email') ?? '').trim();
  if (!email) e.email = 'Enter your work email.';
  else if (!EMAIL.test(email)) e.email = 'Check the email address, for example name@school.org.';
  if (!String(fd.get('school') ?? '').trim()) e.school = 'Enter your school’s name.';
  return e;
}

export function DemoForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const onSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const e = validate(fd);
    setErrors(e);
    if (Object.keys(e).length) {
      const first = form.querySelector<HTMLElement>(`[name="${Object.keys(e)[0]}"]`);
      first?.focus();
      return;
    }
    const payload = {
      name: String(fd.get('name')).trim(),
      email: String(fd.get('email')).trim(),
      school: String(fd.get('school')).trim(),
      sis: String(fd.get('sis') ?? ''),
      source: `${brand.domain} demo form`,
    };

    if (!demo.formEndpoint) {
      // No connected destination: open a pre-filled email. We cannot confirm delivery.
      const body = [
        `Name: ${payload.name}`,
        `Work email: ${payload.email}`,
        `School: ${payload.school}`,
        `Student information system: ${payload.sis || 'Not given'}`,
      ].join('\n');
      const href = `mailto:${brand.salesEmail}?subject=${encodeURIComponent(
        `Demo request: ${payload.school}`,
      )}&body=${encodeURIComponent(body)}`;
      window.location.href = href;
      setStatus({ kind: 'mail' });
      return;
    }

    setStatus({ kind: 'sending' });
    try {
      const res = await fetch(demo.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus({ kind: 'ok' });
      form.reset();
    } catch {
      setStatus({
        kind: 'error',
        message: `We couldn’t send your request. Try again, or email ${brand.salesEmail}.`,
      });
    }
  };

  if (status.kind === 'ok') {
    return (
      <div className="form-card">
        <div className="form-status ok" role="status">
          <strong>Request received.</strong> We’ll reply to your work email to set a time.
        </div>
        {demo.bookingUrl && (
          <a className="btn btn-primary" href={demo.bookingUrl}>
            Pick a time now
          </a>
        )}
      </div>
    );
  }

  const field = (name: keyof Errors, label: string, type: string, autoComplete: string) => (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      <input
        id={`f-${name}`}
        name={name}
        type={type}
        className="input"
        autoComplete={autoComplete}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `f-${name}-err` : undefined}
        onInput={() => errors[name] && setErrors((e) => ({ ...e, [name]: undefined }))}
        required
      />
      {errors[name] && (
        <span className="field-error" id={`f-${name}-err`}>
          {errors[name]}
        </span>
      )}
    </div>
  );

  return (
    <form className="form-card" onSubmit={onSubmit} noValidate aria-label="Book a demo">
      {field('name', 'Name', 'text', 'name')}
      {field('email', 'Work email', 'email', 'email')}
      {field('school', 'School', 'text', 'organization')}
      <div className="field">
        <label htmlFor="f-sis">
          Student information system <span className="optional">(optional)</span>
        </label>
        <select id="f-sis" name="sis" className="select" defaultValue="">
          <option value="">Choose one</option>
          {demo.sisOptions.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Sending…' : demo.formEndpoint ? 'Request a demo' : 'Email your demo request'}
      </button>
      {status.kind === 'error' && (
        <div className="form-status err" role="alert">
          {status.message}
        </div>
      )}
      {status.kind === 'mail' && (
        <div className="form-status info" role="status">
          Your email app should open with the request filled in. Send it from there. If nothing opened, write to{' '}
          <a href={`mailto:${brand.salesEmail}`}>{brand.salesEmail}</a>.
        </div>
      )}
      {!demo.formEndpoint && status.kind === 'idle' && (
        <p className="small muted">
          This opens your email app with the details filled in, addressed to {brand.salesEmail}.
        </p>
      )}
    </form>
  );
}
