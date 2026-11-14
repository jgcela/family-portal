import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { ModuleGate } from '../../announcements/shared';
import { importCommunityAction } from '../actions';
import { ImportForm } from '../../_components/import-form';

export const metadata = { title: 'Import community items' };

export default async function ImportCommunity({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !hasAnywhere(ctx, 'community.create')) notFound();
  const base = await tenantBase(key);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="community" name="Community">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/community`}>← Community</Link>
          </p>
          <h1>Import wishlists and staff favorites</h1>
          <p>
            Load several items from a <code>.json</code> file, for example one prepared when moving from an old website. Items that already exist
            (same kind and name) are skipped, so loading the same file twice adds nothing. Imported items show at once.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <ImportForm run={importCommunityAction.bind(null, key)} canPublish={false} submitLabel="Import" />
        </div>
      </section>
    </ModuleGate>
  );
}
