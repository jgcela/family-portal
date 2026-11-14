import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/errors';
import { LINK_MENUS, getLinkForStaff, type LinkMenu } from '@/server/services/links';
import { DeleteWithConfirm } from '../../_components/workflow';
import { LinkForm } from '../form';
import { deleteLinkAction } from '../actions';

export const metadata = { title: 'Edit link' };

export default async function EditLink({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: key, id } = await params;
  const { ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'navigation.manage') || ctx.support) notFound();
  const base = await tenantBase(key);
  let row;
  try {
    row = await getLinkForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const menus = (Object.keys(LINK_MENUS) as LinkMenu[]).map((m) => ({ value: m, ...LINK_MENUS[m] }));
  return (
    <>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/links`}>← Links</Link>
          </p>
          <h1>{row.label}</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <LinkForm
            tenantKey={key}
            id={row.id}
            menus={menus}
            defaults={{
              menu: row.menu,
              label: row.label,
              target: row.target,
              visibility: row.visibility,
              opensInNewTab: row.opensInNewTab,
              isActive: row.isActive,
              position: row.position,
            }}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-body">
          <DeleteWithConfirm title={row.label} noun="link" run={deleteLinkAction.bind(null, key, row.id)} />
        </div>
      </section>
    </>
  );
}
