import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { myRequests } from '@/server/services/inbox';
import { familyChildren } from '@/server/services/directory';
import { NewRequestForm } from './forms';
import { ITEM_STATUS, KIND, NOTICE_STATUS } from './labels';

export const metadata = { title: 'My requests' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ new?: string; subject?: string; body?: string; kind?: string }> };

export default async function RequestsPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const sp = await searchParams;
  const tenant = await getTenantOr404(key);
  const [view, viewer, base] = await Promise.all([getPortalView(tenant.id), getViewer(tenant.id), tenantBase(key)]);
  if (!view.activeModules.some((m) => m.id === 'operations_inbox')) notFound();
  if (viewer.kind !== 'family') {
    return (
      <div className="container content-page ops-page">
        <h1>My requests</h1>
        <p>
          <Link href={`${base}/login?next=${encodeURIComponent(`${base}/requests`)}`}>Sign in with your family account</Link> to contact the office and follow your requests.
        </p>
      </div>
    );
  }
  // The child list is optional here: if the SIS is unreachable, the family can still write.
  const [rows, kids] = await Promise.all([myRequests(tenant.id, viewer), sp.new === '1' ? familyChildren(tenant.id, viewer).catch(() => []) : Promise.resolve([])]);
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: tenant.timezone });
  const showNew = sp.new === '1';
  return (
    <div className="container content-page ops-page">
      <div className="ops-head">
        <h1>My requests</h1>
        {!showNew && (
          <Link className="btn btn-primary" href={`${base}/requests?new=1`}>
            Contact the office
          </Link>
        )}
      </div>
      {showNew && (
        <section className="card ops-new" aria-labelledby="new-title">
          <h2 id="new-title">Contact the office</h2>
          <NewRequestForm
            tenantKey={key}
            base={base}
            kids={kids.filter((k) => k.canView).map((k) => ({ id: k.key, name: k.name }))}
            kind={sp.kind === 'question' ? 'question' : 'request'}
            defaultSubject={sp.subject?.slice(0, 150)}
            defaultBody={sp.body?.slice(0, 1000)}
          />
        </section>
      )}
      {rows.length === 0 ? (
        <p className="muted">You haven&apos;t sent anything yet.</p>
      ) : (
        <ul className="ops-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`${base}/requests/${r.id}`}>
                <span className="ops-ref">R-{r.number}</span>
                <span className="ops-subject">{r.subject}</span>
                <span className="ops-meta">
                  {KIND[r.kind]} · {fmt.format(r.createdAt)}
                </span>
                <span className={`badge ops-status-${r.noticeStatus ?? r.status}`}>{r.noticeStatus ? NOTICE_STATUS[r.noticeStatus] : ITEM_STATUS[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
