import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getKnowledgeDashboard, getQualityReport, TOPICS } from '@/server/services/knowledge';
import { AiTabs } from '../tabs';
import { QuestionLogForm } from '../forms';

export const metadata = { title: 'AI quality and usage' };

const OUTCOME: Record<string, string> = {
  answered: 'Answered with sources',
  no_answer: 'Not answered (no reliable source)',
  search_only: 'Showed matching sources (AI off)',
  blocked: 'Blocked by the monthly limit',
  error: 'Error',
};

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(2)}`;

export default async function AiQuality({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { ctx, tenant } = await requireStaff(key);
  if (!can(ctx, 'ai.knowledge.manage') && !can(ctx, 'ai.quality.review')) notFound();
  const [base, r, dash] = await Promise.all([tenantBase(key), getQualityReport(ctx, 30), can(ctx, 'ai.knowledge.manage') ? getKnowledgeDashboard(ctx) : null]);
  const topic = Object.fromEntries(TOPICS.map(([v, l]) => [v, l])) as Record<string, string>;
  const portal = r.outcomes.filter((o) => o.channel === 'portal');
  const total = portal.reduce((n, o) => n + o.n, 0);
  const cost = r.outcomes.reduce((n, o) => n + o.cost, 0);
  const helpful = r.helpful.find((h) => h.feedback === 'helpful')?.n ?? 0;
  const notHelpful = r.helpful.find((h) => h.feedback === 'not_helpful')?.n ?? 0;
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>AI Control Center</h1>
          <p>The last {r.days} days. Counts come from the questions actually asked; no question text is shown here.</p>
        </div>
      </div>
      <AiTabs base={base} current="/quality" />
      <div className="insights">
        <div className="insight">
          <strong>{total}</strong> family and visitor questions
        </div>
        <div className="insight">
          <strong>{portal.find((o) => o.outcome === 'answered')?.n ?? 0}</strong> answered with sources
        </div>
        <div className="insight">
          <strong>{helpful}</strong> helpful · <strong>{notHelpful}</strong> not helpful
        </div>
        <div className="insight">
          <strong>{usd(cost)}</strong> AI cost (incl. tests)
        </div>
        {dash && (
          <div className={dash.quota.warn ? 'insight insight-warn' : 'insight'}>
            <strong>{dash.quota.used}</strong> of {dash.quota.limit ?? 'unlimited'} questions this month
          </div>
        )}
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Outcomes</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Where</th>
                <th scope="col">Outcome</th>
                <th scope="col">Questions</th>
                <th scope="col">Avg. time</th>
                <th scope="col">Cost</th>
              </tr>
            </thead>
            <tbody>
              {r.outcomes.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No questions yet.
                  </td>
                </tr>
              )}
              {r.outcomes.map((o, i) => (
                <tr key={i}>
                  <td>{o.channel === 'sandbox' ? 'Staff tests' : 'Portal'}</td>
                  <td>{OUTCOME[o.outcome] ?? o.outcome}</td>
                  <td>{o.n}</td>
                  <td className="muted">{(o.latency / 1000).toFixed(1)} s</td>
                  <td className="muted">{usd(o.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Topics families ask about that have no answer</h2>
        </div>
        <div className="panel-body">
          {r.unanswered.length === 0 ? (
            <p className="muted">None in this period.</p>
          ) : (
            <>
              <ul>
                {r.unanswered.map((u) => (
                  <li key={u.topic}>
                    {topic[u.topic] ?? (u.topic === 'unknown' ? 'Other' : u.topic)}: {u.n}
                  </li>
                ))}
              </ul>
              <p className="muted">Add an FAQ answer or approve a source for these topics.</p>
            </>
          )}
        </div>
      </section>
      {r.failingSources.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Sources that could not be read</h2>
          </div>
          <div className="panel-body">
            <ul>
              {r.failingSources.map((s) => (
                <li key={s.id}>
                  <a href={`${base}/admin/ai/sources/${s.id}`}>{s.title}</a>: <span className="muted">{s.indexError}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>Read questions</h2>
        </div>
        <div className="panel-body">
          {can(ctx, 'ai.conversations.review') && !ctx.support ? (
            <QuestionLogForm tenantKey={key} tz={tenant.timezone} />
          ) : (
            <p className="muted">Only the school owner can read the text of questions, and each read is recorded in the activity log.</p>
          )}
        </div>
      </section>
    </>
  );
}
