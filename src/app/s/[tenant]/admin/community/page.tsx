import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { COMMUNITY_KINDS, listCommunityForStaff, type CommunityKind } from '@/server/services/community';
import { visibilityLabel } from '../_components/audience-picker';
import { ModuleGate } from '../announcements/shared';

export const metadata = { title: 'Community' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ kind?: string; saved?: string; deleted?: string }> };

export default async function CommunityAdmin({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'community.view')) notFound();
  const base = await tenantBase(key);
  const a = `${base}/admin/community`;
  const sp = await searchParams;
  const kind: CommunityKind = sp.kind === 'favorites' ? 'favorites' : 'wishlist';
  const rows = await listCommunityForStaff(ctx, kind);
  const canCreate = !ctx.support && hasAnywhere(ctx, 'community.create');
  const info = COMMUNITY_KINDS[kind];
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="community" name="Community">
      <div className="admin-head">
        <div>
          <h1>Community</h1>
          <p>Teacher wishlists and staff favorite things. Staff favorites are for signed-in families unless you choose otherwise.</p>
        </div>
        {canCreate && (
          <div className="btn-row">
            <Link className="btn btn-quiet btn-sm" href={`${a}/import`}>
              Import from file
            </Link>
            <Link className="btn btn-primary btn-sm" href={`${a}/new?kind=${kind}`}>
              New {info.noun}
            </Link>
          </div>
        )}
      </div>
      <nav className="tabs" aria-label="Community sections">
        {(Object.keys(COMMUNITY_KINDS) as CommunityKind[]).map((k) => (
          <Link key={k} href={`${a}?kind=${k}`} aria-current={k === kind ? 'page' : undefined} className={k === kind ? 'tab tab-active' : 'tab'}>
            {COMMUNITY_KINDS[k].label}
          </Link>
        ))}
      </nav>
      {sp.saved && <div className="notice notice-ok">Saved.</div>}
      {sp.deleted && <div className="notice notice-ok">Deleted.</div>}
      <section className="panel" aria-label={info.label}>
        {rows.length === 0 ? (
          <div className="panel-body">
            <p>Nothing here yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Group</th>
                  <th scope="col">Who can see it</th>
                  <th scope="col">Shown</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title">
                      <Link href={`${a}/${r.id}`}>{r.name}</Link>
                      {r.role && <div className="muted">{r.role}</div>}
                    </td>
                    <td className="muted">{r.groupName ?? '—'}</td>
                    <td className="muted">{visibilityLabel(r.visibility)}</td>
                    <td>{r.isActive ? 'Yes' : 'Hidden'}</td>
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
