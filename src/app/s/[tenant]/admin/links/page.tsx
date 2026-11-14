import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModuleState } from '@/server/services/modules';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { LINK_MENUS, MAX_LINKS_PER_MENU, listLinksForStaff, type LinkMenu } from '@/server/services/links';
import { visibilityLabel } from '../_components/audience-picker';

export const metadata = { title: 'Links' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ saved?: string; deleted?: string }> };

export default async function LinksAdmin({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'navigation.manage')) notFound();
  const base = await tenantBase(key);
  const a = `${base}/admin/links`;
  const sp = await searchParams;
  const [rows, modules] = await Promise.all([listLinksForStaff(ctx), getModuleState(tenant.id)]);
  const quickOn = modules.active.some((m) => m.id === 'quick_links');
  const canEdit = !ctx.support;
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Links</h1>
          <p>Shortcuts families use often: a login button in the header, extra items in the main menu and the Quick access list on the homepage. Changes show at once.</p>
        </div>
        {canEdit && (
          <Link className="btn btn-primary btn-sm" href={`${a}/new`}>
            New link
          </Link>
        )}
      </div>
      {sp.saved && <div className="notice notice-ok">Saved.</div>}
      {sp.deleted && <div className="notice notice-ok">Link deleted.</div>}
      {!quickOn && (
        <div className="notice">
          Header buttons and Quick access only show when the Quick Links module is on. <Link href={`${base}/admin/modules`}>Module Manager</Link>
        </div>
      )}
      {(Object.keys(LINK_MENUS) as LinkMenu[]).map((menu) => {
        const list = rows.filter((r) => r.menu === menu);
        return (
          <section className="panel" key={menu} aria-labelledby={`menu-${menu}`}>
            <div className="panel-head">
              <h2 id={`menu-${menu}`}>{LINK_MENUS[menu].label}</h2>
              <span className="muted">
                {list.length} of {MAX_LINKS_PER_MENU}
              </span>
            </div>
            <div className="panel-body">
              <p className="muted">{LINK_MENUS[menu].hint}</p>
            </div>
            {list.length > 0 && (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Label</th>
                      <th scope="col">Goes to</th>
                      <th scope="col">Who can see it</th>
                      <th scope="col">Shown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id}>
                        <td className="cell-title">{canEdit ? <Link href={`${a}/${r.id}`}>{r.label}</Link> : r.label}</td>
                        <td className="muted cell-url">{r.target}</td>
                        <td className="muted">{visibilityLabel(r.visibility)}</td>
                        <td>{r.isActive ? 'Yes' : 'Hidden'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
