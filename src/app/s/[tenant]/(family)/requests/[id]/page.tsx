import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { myRequest } from '@/server/services/inbox';
import { toDateStr } from '@/server/calendar/time';
import { CancelForm, ReplyForm } from '../forms';
import { ITEM_STATUS, KIND, NOTICE_STATUS, REASON_LABEL, TYPE_LABEL } from '../labels';

export const metadata = { title: 'Request' };
export const dynamic = 'force-dynamic';

const OPEN = ['new', 'in_progress', 'waiting'];
const CANCELLABLE = ['submitted', 'received', 'pending_review', 'approved'];

export default async function RequestPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: key, id } = await params;
  const tenant = await getTenantOr404(key);
  const [view, viewer, base] = await Promise.all([getPortalView(tenant.id), getViewer(tenant.id), tenantBase(key)]);
  if (!view.activeModules.some((m) => m.id === 'operations_inbox') || viewer.kind !== 'family') notFound();
  const r = await myRequest(tenant.id, viewer, id).catch(() => null);
  if (!r) notFound();
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: tenant.timezone });
  const today = toDateStr(new Date(), tenant.timezone);
  const n = r.notice;
  const status = n ? NOTICE_STATUS[n.status] : ITEM_STATUS[r.item.status];
  return (
    <div className="container content-page ops-page">
      <p>
        <Link href={`${base}/requests`}>← My requests</Link>
      </p>
      <h1>{r.item.subject}</h1>
      <p className="ops-meta">
        R-{r.item.number} · {KIND[r.item.kind]} · sent {fmt.format(r.item.createdAt)} · <span className="badge">{status}</span>
      </p>
      {n ? (
        <dl className="ops-facts">
          <dt>Child</dt>
          <dd>{r.student}</dd>
          <dt>Type</dt>
          <dd>{TYPE_LABEL[n.type]}</dd>
          <dt>{n.dateFrom === n.dateTo ? 'Date' : 'Dates'}</dt>
          <dd>
            {n.dateFrom === n.dateTo ? n.dateFrom : `${n.dateFrom} to ${n.dateTo}`}
            {n.time ? ` at ${n.time}` : ''}
          </dd>
          <dt>Reason</dt>
          <dd>{REASON_LABEL[n.reason]}</dd>
          {n.comment && (
            <>
              <dt>Your comment</dt>
              <dd>{n.comment}</dd>
            </>
          )}
          {n.reviewNote && (
            <>
              <dt>From the office</dt>
              <dd>{n.reviewNote}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="ops-body">{r.item.body}</p>
      )}
      <h2>History</h2>
      <ol className="ops-timeline">
        {r.events.map((e, i) => (
          <li key={i}>
            <time>{fmt.format(e.createdAt)}</time>
            <span>
              {e.kind === 'reply' ? <strong>{e.actorKind === 'family' ? 'You' : 'School'}: </strong> : null}
              {e.body || (e.kind === 'status' && e.toValue ? `Status: ${NOTICE_STATUS[e.toValue as keyof typeof NOTICE_STATUS] ?? ITEM_STATUS[e.toValue] ?? e.toValue}` : '')}
            </span>
          </li>
        ))}
      </ol>
      {OPEN.includes(r.item.status) && <ReplyForm tenantKey={key} id={r.item.id} />}
      {n && CANCELLABLE.includes(n.status) && n.dateTo >= today && <CancelForm tenantKey={key} id={r.item.id} noticeId={n.id} label="Cancel this notice" />}
      {!n && OPEN.includes(r.item.status) && <CancelForm tenantKey={key} id={r.item.id} noticeId={null} label="I no longer need this" />}
    </div>
  );
}
