import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { listVolunteerForStaff } from '@/server/services/volunteer';
import { ModuleGate } from '../../announcements/shared';
import { AudiencePicker } from '../../_components/audience-picker';
import { VolunteerForm } from '../form';

export const metadata = { title: 'New opportunity' };

export default async function NewVolunteer({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'volunteer.create')) notFound();
  const base = await tenantBase(key);
  const [auds, settings, rows] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id), listVolunteerForStaff(ctx)]);
  const categories = [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort();
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="volunteer" name="Volunteer">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/volunteer`}>← Volunteer</Link>
          </p>
          <h1>New opportunity</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <VolunteerForm
            tenantKey={key}
            id={null}
            status={null}
            categories={categories}
            canPublish={hasAnywhere(ctx, 'volunteer.publish')}
            requireApproval={settings.requireApproval}
            audiencePicker={<AudiencePicker audiences={auds} selected={[]} visibility="families" />}
            defaults={{ title: '', category: '', organizer: '', location: '', schedule: '', commitment: '', summary: '', body: '', actions: [], sortOrder: (rows.length + 1) * 10 }}
          />
        </div>
      </section>
    </ModuleGate>
  );
}
