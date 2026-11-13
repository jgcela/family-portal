import Link from 'next/link';
import { requirePlatformAdmin } from '@/server/request';
import { getPlatformHealth } from '@/server/services/platform-ops';
import { ACTION_LABEL } from '../_components/activity';
import { fmtDate, formatBytes, STATUS_LABEL } from '../_components/format';

export const metadata = { title: 'System health' };

export default async function HealthPage() {
  const { ctx } = await requirePlatformAdmin();
  const h = await getPlatformHealth(ctx);
  const nearFull = h.storage.filter((s) => s.pct >= 80);
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>System health</h1>
          <p>Figures from the platform database, as of this page load. Things that need someone are listed first.</p>
        </div>
      </div>

      <dl className="stat-grid">
        {(['active', 'onboarding', 'suspended'] as const).map((s) => (
          <div className="stat" key={s}>
            <dt>{STATUS_LABEL[s]} schools</dt>
            <dd>{h.schools[s] ?? 0}</dd>
          </div>
        ))}
        <div className="stat">
          <dt>Files stored</dt>
          <dd>{formatBytes(h.totalStorageBytes)}</dd>
        </div>
        <div className="stat">
          <dt>Support access</dt>
          <dd>
            {h.support.active} active
            <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}> · {h.support.pending} waiting</span>
          </dd>
        </div>
      </dl>

      <section className="panel" aria-labelledby="attention">
        <div className="panel-head">
          <h2 id="attention">Needs attention</h2>
        </div>
        <ul className="member-list">
          {h.pastDue.map((s) => (
            <li className="member" key={`pd-${s.id}`}>
              <div>
                <span className="status status-danger">Payment overdue</span> <Link href={`/platform/schools/${s.id}`}>{s.name}</Link>
              </div>
            </li>
          ))}
          {h.trialsEnding.map((s) => (
            <li className="member" key={`tr-${s.id}`}>
              <div>
                <span className="status status-in_review">Trial ends {fmtDate(s.trialEndsAt)}</span> <Link href={`/platform/schools/${s.id}`}>{s.name}</Link>
              </div>
            </li>
          ))}
          {nearFull.map((s) => (
            <li className="member" key={`st-${s.id}`}>
              <div>
                <span className="status status-in_review">Storage {s.pct}%</span> <Link href={`/platform/schools/${s.id}`}>{s.name}</Link>{' '}
                <span className="muted">
                  {formatBytes(s.bytes)} of {formatBytes(s.limitBytes)}
                </span>
              </div>
            </li>
          ))}
          {h.domainsWaiting.map((d) => (
            <li className="member" key={`dw-${d.hostname}`}>
              <div>
                <span className="status status-in_review">Domain waiting for DNS</span> <code>{d.hostname}</code> ·{' '}
                <Link href={`/platform/schools/${d.tenantId}`}>{d.school}</Link>
              </div>
            </li>
          ))}
          {h.importIssues.map((i) => (
            <li className="member" key={`im-${i.id}`}>
              <div>
                <span className="status status-in_review">Calendar import rows skipped</span> <Link href={`/platform/schools/${i.id}`}>{i.name}</Link>{' '}
                <span className="muted">{i.n} import{i.n === 1 ? '' : 's'} with unreadable rows in 30 days</span>
              </div>
            </li>
          ))}
          {!h.pastDue.length && !h.trialsEnding.length && !nearFull.length && !h.domainsWaiting.length && !h.importIssues.length && (
            <li className="member muted">Nothing needs attention.</li>
          )}
        </ul>
      </section>

      <section className="panel" aria-labelledby="domains">
        <div className="panel-head">
          <h2 id="domains">Verified custom domains</h2>
        </div>
        <div className="panel-body">
          <p className="muted">
            A school proves it owns a domain with a DNS record. Before visitors can reach it, someone with access to the
            Vercel project must add the domain there (Settings → Domains) and add it to <code>AUTH_EXTRA_HOSTS</code> so
            sign-in works on it. This page can’t check Vercel.
          </p>
          {h.domainsVerified.length === 0 ? (
            <p className="muted" style={{ marginTop: 'var(--space-2)' }}>None yet.</p>
          ) : (
            <ul>
              {h.domainsVerified.map((d) => (
                <li key={d.hostname}>
                  <code>{d.hostname}</code> · <Link href={`/platform/schools/${d.tenantId}`}>{d.school}</Link> · verified {fmtDate(d.verifiedAt)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="security">
        <div className="panel-head">
          <h2 id="security">Security events (7 days)</h2>
        </div>
        {h.recentSecurity.length === 0 ? (
          <p className="panel-body muted">None.</p>
        ) : (
          <ul className="member-list">
            {h.recentSecurity.map((e) => (
              <li className="member" key={e.id}>
                <div>
                  {ACTION_LABEL[e.action] ?? e.action}
                  {e.school ? ` · ${e.school}` : ''} <span className="muted">· {e.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="not-connected">
        <div className="panel-head">
          <h2 id="not-connected">Not connected yet</h2>
        </div>
        <div className="panel-body">
          <ul>
            <li>Application errors: no error-tracking service is connected. Vercel → Logs shows server errors.</li>
            <li>Background jobs: the platform has none yet (imports run while the person waits).</li>
            <li>Email delivery: no email provider yet.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
