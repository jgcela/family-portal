'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { disableAction, finishSetupAction, regenerateCodesAction, startSetupAction } from './actions';

type Setup = { qrSvg: string; secret: string; backupCodes: string[] };

export function SecurityPanel({ enabled, required, showRequiredNotice }: { enabled: boolean; required: boolean; showRequiredNotice?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [done, setDone] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [disabled, setDisabled] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  }

  const notice = showRequiredNotice ? (
    <p className="field-error" role="alert" style={{ margin: 0 }}>
      Platform administrators must turn on two-step sign-in before opening the platform.
    </p>
  ) : null;

  // ---- Finished: show the backup codes one last time. ----
  if (done && setup) {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <p role="status" style={{ margin: 0 }}>
          <strong>Two-step sign-in is on.</strong> Any other place where this account was signed in has been signed out.
        </p>
        <BackupCodes codes={setup.backupCodes} />
        <button className="btn btn-primary" type="button" onClick={() => router.push(required ? '/platform' : '/account/security')}>
          I saved my backup codes{required ? ', go to the platform' : ''}
        </button>
      </div>
    );
  }

  if (disabled) {
    return (
      <p role="status" style={{ margin: 0 }}>
        Two-step sign-in is off. You can turn it on again at any time.
      </p>
    );
  }

  // ---- Already on: new backup codes, or turn off (not for platform admins). ----
  if (enabled) {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <p style={{ margin: 0 }}>
          <span className="status status-published">On</span> When you sign in, you also type a code from your authenticator app.
        </p>
        {newCodes ? (
          <BackupCodes codes={newCodes} />
        ) : (
          <PasswordForm
            id="regen"
            label="New backup codes"
            help="Makes 10 new backup codes. The old ones stop working."
            button="Make new backup codes"
            pending={pending}
            onSubmit={(password) =>
              run(async () => {
                const r = await regenerateCodesAction(password);
                if (r.error) setError(r.error);
                else if (r.backupCodes) setNewCodes(r.backupCodes);
              })
            }
          />
        )}
        {!required && (
          <PasswordForm
            id="disable"
            label="Turn off two-step sign-in"
            help="Your account will only be protected by your password."
            button="Turn off"
            quiet
            pending={pending}
            onSubmit={(password) =>
              run(async () => {
                const r = await disableAction(password);
                if (r.error) setError(r.error);
                else {
                  setDisabled(true);
                  router.refresh();
                }
              })
            }
          />
        )}
        {required && (
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Platform administrators cannot turn it off. Lost your phone and your backup codes? Another platform owner with access to the
            database can reset it (see docs/06-operacion-plataforma.md).
          </p>
        )}
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ---- Step 1: confirm password. ----
  if (!setup) {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {notice}
        <p style={{ margin: 0 }}>
          After your password, you will also type a 6-digit code from an authenticator app on your phone (for example Google Authenticator,
          Microsoft Authenticator or 1Password). Someone who learns your password still cannot get in without your phone.
        </p>
        <PasswordForm
          id="start"
          label="Your password"
          help="To make sure it is you."
          button="Start setup"
          pending={pending}
          onSubmit={(password) =>
            run(async () => {
              const r = await startSetupAction(password);
              if (r.error) setError(r.error);
              else if (r.qrSvg && r.secret && r.backupCodes) setSetup({ qrSvg: r.qrSvg, secret: r.secret, backupCodes: r.backupCodes });
            })
          }
        />
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ---- Step 2: scan and type the first code. ----
  return (
    <>
    {notice}
    <form
      style={{ display: 'grid', gap: 'var(--space-4)' }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get('code') ?? '');
        run(async () => {
          const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, '') });
          if (error) {
            setError(error.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'That code did not work. Check the time on your phone and try the newest code.');
            return;
          }
          const r = await finishSetupAction();
          if (r.error) setError(r.error);
          else setDone(true);
        });
      }}
    >
      <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: 'var(--space-2)' }}>
        <li>Open your authenticator app and add a new account (usually a “+” button).</li>
        <li>Scan this code with the phone camera.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div
        aria-label="QR code for your authenticator app"
        role="img"
        style={{ width: 200, height: 200, background: '#fff', padding: 8, borderRadius: 8, border: '1px solid var(--border-strong)' }}
        dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
      />
      <details>
        <summary>Can’t scan? Type this key instead</summary>
        <p style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', userSelect: 'all' }}>{groupKey(setup.secret)}</p>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Choose “time-based” if the app asks.</p>
      </details>
      <div className="field">
        <label htmlFor="code">6-digit code from the app</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus />
      </div>
      {error && <ErrorText text={error} />}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Turn on two-step sign-in'}
      </button>
    </form>
    </>
  );
}

function PasswordForm(props: { id: string; label: string; help: string; button: string; quiet?: boolean; pending: boolean; onSubmit: (password: string) => void }) {
  return (
    <form
      style={{ display: 'grid', gap: 'var(--space-2)' }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit(String(new FormData(e.currentTarget).get('password') ?? ''));
      }}
    >
      <div className="field">
        <label htmlFor={`${props.id}-password`}>{props.label}</label>
        <input id={`${props.id}-password`} name="password" type="password" autoComplete="current-password" required />
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {props.help}
        </span>
      </div>
      <div className="btn-row">
        <button className={props.quiet ? 'btn btn-quiet' : 'btn btn-primary'} type="submit" disabled={props.pending}>
          {props.button}
        </button>
      </div>
    </form>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Your backup codes</h2>
      <p style={{ margin: 0 }}>
        If you lose your phone, each of these codes lets you sign in once. Save them now in a safe place (a password manager, or printed and
        kept somewhere safe). <strong>They will not be shown again.</strong>
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 'var(--space-3)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))',
          gap: 'var(--space-2)',
          fontFamily: 'ui-monospace, monospace',
          background: 'var(--surface-sunken)',
          borderRadius: 8,
        }}
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          {copied ? 'Copied' : 'Copy codes'}
        </button>
        <a
          className="btn btn-quiet"
          download="backup-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Backup codes (each works once)\n\n${text}\n`)}`}
        >
          Download as a file
        </a>
      </div>
    </div>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p className="field-error" role="alert" style={{ margin: 0 }}>
      {text}
    </p>
  );
}

function groupKey(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
