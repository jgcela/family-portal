import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getKnowledgeDashboard, TOPICS } from '@/server/services/knowledge';
import { listAudiences } from '@/server/services/calendar';
import { DeleteSourceForm, SourceForm } from '../../forms';
import { KIND_LABEL } from '../../tabs';

export const metadata = { title: 'Source' };

export default async function EditSource({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: key, id } = await params;
  const { ctx, tenant } = await requireStaff(key);
  if (!can(ctx, 'ai.knowledge.manage')) notFound();
  const [base, dash, auds] = await Promise.all([tenantBase(key), getKnowledgeDashboard(ctx), listAudiences(tenant.id)]);
  const s = dash.sources.find((x) => x.id === id);
  if (!s) notFound();
  const own = s.kind === 'faq' || s.kind === 'text';
  const editHref =
    s.kind === 'document' ? `${base}/admin/documents/${s.refId}` : s.kind === 'page' ? `${base}/admin/pages/${s.refId}` : s.kind === 'announcement' ? `${base}/admin/announcements/${s.refId}` : s.kind === 'calendar' ? `${base}/admin/calendar` : `${base}/admin/volunteer`;
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="muted">
            <Link href={`${base}/admin/ai`}>AI Control Center</Link>
          </p>
          <h1>{s.title}</h1>
          <p>
            {KIND_LABEL[s.kind]} · {s.status === 'approved' ? 'Approved' : s.status === 'pending' ? 'Suggested (not used yet)' : 'Removed'}
            {s.indexedAt && ` · last checked ${s.indexedAt.toISOString().slice(0, 10)}`}
          </p>
        </div>
      </div>
      {!own && (
        <div className="notice">
          The text, title and who can see it come from the portal. To correct it, <Link href={editHref}>edit it there</Link>; the assistant picks up the change on the next check.
          {s.kind === 'calendar' && ' Calendar answers are read live from published events, so they are always current.'}
        </div>
      )}
      {s.indexError && <div className="notice notice-error">{s.indexError}</div>}
      <section className="panel">
        <div className="panel-body">
          {ctx.support ? (
            <p className="muted">Read-only support session.</p>
          ) : (
            <SourceForm
              tenantKey={key}
              id={s.id}
              kind={own ? (s.kind as 'faq' | 'text') : null}
              own={own}
              topics={TOPICS}
              audiences={auds.filter((x) => x.kind !== 'staff')}
              defaults={{
                title: s.title,
                body: s.body ?? '',
                topic: s.topic,
                visibility: s.visibility,
                audienceIds: s.audienceIds,
                authoritative: s.authoritative,
                effectiveDate: s.effectiveDate ?? '',
                reviewBy: s.reviewBy ?? '',
                url: s.url ?? '',
              }}
            />
          )}
        </div>
      </section>
      {own && !ctx.support && (
        <section className="panel">
          <div className="panel-head">
            <h2>Delete</h2>
          </div>
          <div className="panel-body">
            <DeleteSourceForm tenantKey={key} id={s.id} />
          </div>
        </section>
      )}
    </>
  );
}
