import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { LINK_MENUS, listLinksForStaff, type LinkMenu } from '@/server/services/links';
import { LinkForm } from '../form';

export const metadata = { title: 'New link' };

export default async function NewLink({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'navigation.manage') || ctx.support) notFound();
  const base = await tenantBase(key);
  const rows = await listLinksForStaff(ctx);
  const menus = (Object.keys(LINK_MENUS) as LinkMenu[]).map((m) => ({ value: m, ...LINK_MENUS[m] }));
  return (
    <>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/links`}>← Links</Link>
          </p>
          <h1>New link</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <LinkForm
            tenantKey={key}
            id={null}
            menus={menus}
            defaults={{ menu: 'quick', label: '', target: '', visibility: 'public', opensInNewTab: false, isActive: true, position: (rows.length + 1) * 10 }}
          />
        </div>
      </section>
    </>
  );
}
