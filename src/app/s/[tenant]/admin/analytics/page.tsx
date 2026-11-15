import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getOpsAnalytics, PERIODS, type Period } from '@/server/services/analytics';
import { activeModuleIds } from '@/server/services/ops-common';
import { OpsForm } from '../_ops/forms';
import { assumptionsAction } from './actions';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

const PERIOD_LABEL: Record<Period, string> = { 7: '7 days', 30: '30 days', 90: '90 days', 365: '12 months' };

function duration(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}
const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: v < 100 ? 2 : 0 })}`;

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ days?: string }> };

export default async function AnalyticsPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !can(ctx, 'analytics.view') || !(await activeModuleIds(tenant.id)).has('ops_analytics')) notFound();
  const asked = Number((await searchParams).days);
  const days: Period = (PERIODS as readonly number[]).includes(asked) ? (asked as Period) : 30;
  const [r, base] = await Promise.all([getOpsAnalytics(ctx, days), tenantBase(key)]);
  const a = `${base}/admin/analytics`;
  const maxWeek = Math.max(1, ...r.volume.weekly.map((w) => w.attendance + w.other));
  const fmtWeek = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const m = r.estimate.minutes;
  const as = r.assumptions;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Analytics</h1>
          <p>What the portal handled for the office. Only counts and times: no names, messages or questions are shown here.</p>
        </div>
      </div>

      <nav className="tabs" aria-label="Period">
        {PERIODS.map((p) => (
          <Link key={p} href={`${a}?days=${p}`} aria-current={p === days ? 'page' : undefined} className={p === days ? "tab tab-active" : "tab"}>
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </nav>

      <section className="panel" aria-labelledby="saved-title">
        <div className="panel-head">
          <h2 id="saved-title">Estimated staff time saved</h2>
        </div>
        <div className="panel-body">
          <p className="analytics-big">
            <strong>{r.estimate.hours} h</strong>
            {r.estimate.staffCostSavedUsd !== null && <span> ≈ {usd(r.estimate.staffCostSavedUsd)} of staff time</span>}
          </p>
          <p className="hint">
            An estimate, not a measurement: the portal can&apos;t see the phone calls and emails it replaced. It multiplies what it handled by the minutes below.
            Change them to match your office.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Handled by the portal</th>
                  <th scope="col">Count</th>
                  <th scope="col">Minutes each</th>
                  <th scope="col">Minutes saved</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Absence, late and early-dismissal notices sent online</td>
                  <td>{r.notices.total}</td>
                  <td>{as.minutesPerAbsenceCall}</td>
                  <td>{m.absences}</td>
                </tr>
                <tr>
                  <td>Questions the AI answered with a source (not sent on to the office)</td>
                  <td>{r.ai.answered}</td>
                  <td>{as.minutesPerAnsweredQuestion}</td>
                  <td>{m.questions}</td>
                </tr>
                <tr>
                  <td>Inbox items closed by a workflow rule, with no staff step</td>
                  <td>{r.automation.automated}</td>
                  <td>{as.minutesPerAutomatedItem}</td>
                  <td>{m.automation}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted">AI cost in this period: {usd(r.estimate.aiCostUsd)}.</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="vol-title">
        <div className="panel-head">
          <h2 id="vol-title">Volume</h2>
        </div>
        <div className="panel-body">
          <dl className="stat-grid">
            <div className="stat">
              <dt>Inbox items</dt>
              <dd>{r.volume.items}</dd>
            </div>
            <div className="stat">
              <dt>Attendance notices</dt>
              <dd>{r.notices.total}</dd>
            </div>
            <div className="stat">
              <dt>Questions to the office</dt>
              <dd>{r.volume.questions}</dd>
            </div>
            <div className="stat">
              <dt>Other requests</dt>
              <dd>{r.volume.requests}</dd>
            </div>
          </dl>
          <p className="muted">
            Notices: {r.notices.absent} absent · {r.notices.late} late · {r.notices.early} early dismissal · {r.notices.cancelled} cancelled by the family ·{' '}
            {r.notices.enteredInSis} marked as entered in the SIS.
          </p>
          {r.volume.weekly.length > 0 && (
            <div className="table-wrap">
              <table className="data analytics-weeks">
                <caption className="visually-hidden">Inbox items per week</caption>
                <thead>
                  <tr>
                    <th scope="col">Week of</th>
                    <th scope="col">Attendance</th>
                    <th scope="col">Other</th>
                    <th scope="col">
                      <span className="visually-hidden">Bar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.volume.weekly.map((w) => (
                    <tr key={w.week}>
                      <td>{fmtWeek.format(new Date(`${w.week}T00:00:00Z`))}</td>
                      <td>{w.attendance}</td>
                      <td>{w.other}</td>
                      <td className="analytics-bar-cell" aria-hidden="true">
                        <span className="analytics-bar analytics-bar-a" style={{ width: `${(w.attendance / maxWeek) * 100}%` }} />
                        <span className="analytics-bar analytics-bar-b" style={{ width: `${(w.other / maxWeek) * 100}%` }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="speed-title">
        <div className="panel-head">
          <h2 id="speed-title">Response</h2>
        </div>
        <div className="panel-body">
          <dl className="stat-grid">
            <div className="stat">
              <dt>Typical first reply</dt>
              <dd>{duration(r.speed.medianFirstResponseHours)}</dd>
            </div>
            <div className="stat">
              <dt>Typical time to resolve</dt>
              <dd>{duration(r.speed.medianResolveHours)}</dd>
            </div>
            <div className="stat">
              <dt>Replied within 24 h</dt>
              <dd>{pct(r.speed.respondedWithin24hPct)}</dd>
            </div>
            <div className="stat">
              <dt>Open now</dt>
              <dd>
                {r.speed.openNow}
                {r.speed.overdueNow > 0 && <span className="analytics-note"> · {r.speed.overdueNow} overdue</span>}
              </dd>
            </div>
          </dl>
          <p className="hint">&ldquo;Typical&rdquo; is the median, so one very slow item does not distort it. Items closed by a workflow rule are left out.</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="ai-title">
        <div className="panel-head">
          <h2 id="ai-title">AI and automation</h2>
        </div>
        <div className="panel-body">
          <dl className="stat-grid">
            <div className="stat">
              <dt>Questions to the AI</dt>
              <dd>{r.ai.questions}</dd>
            </div>
            <div className="stat">
              <dt>Answered with a source</dt>
              <dd>{pct(r.ai.answeredPct)}</dd>
            </div>
            <div className="stat">
              <dt>Closed automatically</dt>
              <dd>{pct(r.automation.automatedPct)}</dd>
            </div>
            <div className="stat">
              <dt>AI cost per answer</dt>
              <dd>{r.ai.costPerAnswerUsd === null ? '—' : `$${r.ai.costPerAnswerUsd.toFixed(3)}`}</dd>
            </div>
          </dl>
          <p className="muted">
            {r.ai.portal} on the Ask page · {r.ai.assistant} in the family assistant · {r.ai.noAnswer} without a reliable answer · {r.ai.escalated} sent on to the
            office · {r.ai.helpful} marked helpful, {r.ai.notHelpful} not helpful. The assistant prepared {r.ai.draftsPrepared} drafts; families sent{' '}
            {r.ai.draftsSent}.
          </p>
        </div>
      </section>

      {can(ctx, 'modules.configure') && (
        <section className="panel" aria-labelledby="as-title">
          <div className="panel-head">
            <h2 id="as-title">Your assumptions</h2>
          </div>
          <div className="panel-body">
            <OpsForm action={assumptionsAction.bind(null, key)} submit="Save">
              <div className="field">
                <label htmlFor="as-abs">Minutes the office spends on an absence call or email</label>
                <input id="as-abs" name="minutesPerAbsenceCall" type="number" min={0} max={60} step={1} defaultValue={as.minutesPerAbsenceCall} />
              </div>
              <div className="field">
                <label htmlFor="as-q">Minutes to answer a routine question</label>
                <input id="as-q" name="minutesPerAnsweredQuestion" type="number" min={0} max={60} step={1} defaultValue={as.minutesPerAnsweredQuestion} />
              </div>
              <div className="field">
                <label htmlFor="as-auto">Minutes to sort and close a simple item by hand</label>
                <input id="as-auto" name="minutesPerAutomatedItem" type="number" min={0} max={60} step={1} defaultValue={as.minutesPerAutomatedItem} />
              </div>
              <div className="field">
                <label htmlFor="as-cost">Hourly staff cost in USD (optional)</label>
                <input id="as-cost" name="hourlyStaffCost" type="number" min={0} max={500} step={1} defaultValue={as.hourlyStaffCost} />
                <span className="hint">Leave at 0 to show hours only.</span>
              </div>
            </OpsForm>
          </div>
        </section>
      )}
    </>
  );
}
