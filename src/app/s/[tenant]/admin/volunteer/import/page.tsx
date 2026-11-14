import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings } from '@/server/services/calendar';
import { ModuleGate } from '../../announcements/shared';
import { importVolunteerAction } from '../actions';
import { ImportForm } from '../../_components/import-form';

export const metadata = { title: 'Import opportunities' };

export default async function ImportVolunteer({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !hasAnywhere(ctx, 'volunteer.create')) notFound();
  const base = await tenantBase(key);
  const settings = await getContentSettings(tenant.id);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="volunteer" name="Volunteer">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/volunteer`}>← Volunteer</Link>
          </p>
          <h1>Import opportunities</h1>
          <p>
            Load several opportunities from a <code>.json</code> file, for example one prepared when moving from an old website. Opportunities
            whose title already exists are skipped, so loading the same file twice adds nothing.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <ImportForm run={importVolunteerAction.bind(null, key)} canPublish={hasAnywhere(ctx, 'volunteer.publish') && !settings.requireApproval} />
        </div>
      </section>
    </ModuleGate>
  );
}
