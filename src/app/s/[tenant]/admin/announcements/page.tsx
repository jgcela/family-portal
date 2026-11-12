import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listAnnouncementsForStaff } from '@/server/services/content';
import { listAudiences } from '@/server/services/calendar';
import { StatusBadge, STATUS_LABEL } from '../calendar/shared';
import { formatInstant, ModuleGate } from './shared';

export const metadata = { title: 'Announcements' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ status?: string; q?: string; deleted?: string }> };

export default async function AnnouncementsPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'announcements.view')) notFound();
  const base = await tenantBase(key);
  const a = `${base}/admin/announcements`;
  const sp = await searchParams;
  const status = sp.status && sp.status in STATUS_LABEL ? (sp.status as keyof typeof STATUS_LABEL) : undefined;
  const [rows, auds] = await Promise.all([listAnnouncementsForStaff(ctx, { status, q: sp.q?.slice(0, 100) }), listAudiences(tenant.id)]);
  const audName = new Map(auds.map((x) => [x.id, x.name]));
  const now = new Date();
  const liveLabel = (r: (typeof rows)[number]) => {
    if (r.status !== 'published') return null;
    if (r.publishAt && r.publishAt > now) return `Scheduled for ${formatInstant(r.publishAt, tenant.timezone)}`;
    if (r.expiresAt && r.expiresAt <= now) return 'Expired';
    return null;
  };
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="announcements" name="Announcements">
      <div className="admin-head">
        <div>
          <h1>Announcements</h1>
          <p>School updates for families. Urgent announcements appear first on the homepage.</p>
        </div>
        {hasAnywhere(ctx, 'announcements.create') && (
          <Link className="btn btn-primary btn-sm" href={`${a}/new`}>
            New announcement
          </Link>
        )}
      </div>
      {sp.deleted && <div className="notice notice-ok">Announcement deleted.</div>}
      <section className="panel" aria-label="Announcements">
        <form className="filters" method="get" role="search">
          <div className="field">
            <label htmlFor="f-q">Search</label>
            <input id="f-q" name="q" type="search" defaultValue={sp.q ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" name="status" defaultValue={status ?? ''}>
              <option value="">Any status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-quiet btn-sm" type="submit">
            Filter
          </button>
        </form>
        {rows.length === 0 ? (
          <div className="panel-body">
            <p>{sp.q || status ? 'No announcements match these filters.' : 'No announcements yet.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Announcement</th>
                  <th scope="col">For</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title">
                      <Link href={`${a}/${r.id}`}>{r.title}</Link>
                      {(r.isUrgent || r.isPinned) && <div className="muted">{[r.isUrgent && 'Urgent', r.isPinned && 'Pinned'].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td className="muted">{r.audienceIds.length ? r.audienceIds.map((id) => audName.get(id) ?? '?').join(', ') : 'Whole school'}</td>
                    <td className="nowrap">{formatInstant(r.updatedAt, tenant.timezone)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {liveLabel(r) && <div className="muted">{liveLabel(r)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ModuleGate>
  );
}
