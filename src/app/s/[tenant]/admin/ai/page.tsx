import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getKnowledgeDashboard, TOPICS } from '@/server/services/knowledge';
import { AiTabs, KIND_LABEL } from './tabs';
import { RefreshButton, SourcesTable, type SourceRow } from './forms';
import { visibilityLabel } from '../_components/audience-picker';

export const metadata = { title: 'AI Control Center' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ saved?: string; deleted?: string }> };

const INDEX: Record<string, string> = { waiting: 'Waiting', indexed: 'Indexed', failed: 'Failed', unsupported: 'Unsupported', live: 'Live' };

export default async function AiKnowledge({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { ctx } = await requireStaff(key);
  if (!can(ctx, 'ai.knowledge.manage')) notFound();
  const [base, sp, dash] = await Promise.all([tenantBase(key), searchParams, getKnowledgeDashboard(ctx)]);
  const a = `${base}/admin/ai`;
  const canEdit = !ctx.support;
  const topicLabel = Object.fromEntries(TOPICS.map(([v, l]) => [v, l]));
  const rows: SourceRow[] = dash.sources.map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    kindLabel: KIND_LABEL[s.kind] ?? s.kind,
    topicLabel: topicLabel[s.topic] ?? s.topic,
    status: s.status,
    index: s.indexStatus === 'indexed' ? `Indexed (${s.chunkCount} parts)` : (INDEX[s.indexStatus] ?? s.indexStatus),
    indexError: s.indexError,
    health: s.health,
    visibility: s.kind === 'calendar' ? 'Same as each event' : s.kind === 'volunteer' ? 'Same as each opportunity' : visibilityLabel(s.visibility),
    authoritative: s.authoritative,
    editHref: `${a}/sources/${s.id}`,
    openHref: s.url ? (s.url.startsWith('/') ? `${base}${s.url}` : s.url) : null,
  }));
  const approved = dash.sources.filter((s) => s.status === 'approved').length;
  const suggested = dash.sources.filter((s) => s.status === 'pending').length;
  const attention = dash.sources.filter((s) => s.status !== 'removed' && (s.health !== 'ok' || s.indexStatus === 'failed' || s.indexStatus === 'unsupported')).length;
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>AI Control Center</h1>
          <p>
            Choose what the school assistant may use to answer families. It answers only from approved sources, shows the source with every answer, and says so when it
            doesn&apos;t know.
          </p>
        </div>
        {canEdit && dash.entitled && (
          <div className="btn-row">
            <RefreshButton tenantKey={key} />
            <Link className="btn btn-quiet btn-sm" href={`${a}/sources/new?kind=text`}>
              Paste text
            </Link>
            <Link className="btn btn-primary btn-sm" href={`${a}/sources/new?kind=faq`}>
              New FAQ answer
            </Link>
          </div>
        )}
      </div>
      <AiTabs base={base} current="" />
      {!dash.entitled && <div className="notice">The School Knowledge AI is part of the Smart and Autonomous plans. Contact us to change plans.</div>}
      {dash.entitled && !dash.moduleActive && (
        <div className="notice">
          The School Knowledge AI module is off. You can prepare and test sources now; turn it on in the <Link href={`${base}/admin/modules`}>Module Manager</Link> when ready.
        </div>
      )}
      {sp.saved && <div className="notice notice-ok">Saved.</div>}
      {sp.deleted && <div className="notice notice-ok">Source deleted.</div>}
      <div className="insights">
        <div className="insight">
          <strong>{approved}</strong> approved sources
        </div>
        <div className="insight">
          <strong>{suggested}</strong> suggested, waiting for approval
        </div>
        <div className={attention ? 'insight insight-warn' : 'insight insight-ok'}>
          <strong>{attention}</strong> need attention
        </div>
        <div className={dash.quota.warn ? 'insight insight-warn' : 'insight'}>
          <strong>{dash.quota.used}</strong> of {dash.quota.limit === null ? 'unlimited' : dash.quota.limit} AI questions this month
        </div>
        <div className="insight">
          Families: <strong>{dash.settings.familiesEnabled ? 'on' : 'off'}</strong> · Visitors: <strong>{dash.settings.publicEnabled ? 'on' : 'off'}</strong>
        </div>
      </div>
      {dash.quota.warn && !dash.quota.blocked && <div className="notice">The school has used over 80% of this month&apos;s AI questions. At the limit, the assistant pauses until next month; nothing is charged.</div>}
      {dash.quota.blocked && <div className="notice notice-error">This month&apos;s AI questions are used up. The assistant is paused until next month.</div>}
      <section className="panel" aria-labelledby="sources-title">
        <div className="panel-head">
          <h2 id="sources-title">Sources</h2>
        </div>
        <div className="panel-body">
          <p className="muted">
            Published documents, school pages and announcements appear here as suggestions when you check the portal for changes (this also happens once a day). Edits in the
            portal are picked up and reindexed automatically; unpublished or staff-only items stop being used at once. Upload new files in{' '}
            <Link href={`${base}/admin/documents`}>Documents</Link>.
          </p>
        </div>
        <SourcesTable tenantKey={key} rows={rows} canEdit={canEdit} />
      </section>
    </>
  );
}
