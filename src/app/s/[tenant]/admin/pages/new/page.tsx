import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { PageForm } from '../form';
import { ModuleGate } from '../../announcements/shared';
import { AudiencePicker } from '../../_components/audience-picker';

export const metadata = { title: 'New page' };

export default async function NewPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'pages.create')) notFound();
  const base = await tenantBase(key);
  const [auds, settings] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id)]);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="pages" name="School Pages">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/pages`}>← School pages</Link>
          </p>
          <h1>New page</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <PageForm
            tenantKey={key}
            id={null}
            status={null}
            isLive={false}
            urlPrefix={base}
            canPublish={hasAnywhere(ctx, 'pages.publish')}
            requireApproval={settings.requireApproval}
            audiencePicker={<AudiencePicker audiences={auds} selected={[]} visibility="public" />}
            defaults={{ title: '', slug: '', body: '', showToc: false, sortOrder: 0 }}
          />
        </div>
      </section>
    </ModuleGate>
  );
}
