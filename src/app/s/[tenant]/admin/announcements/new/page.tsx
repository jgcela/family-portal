import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { AnnouncementForm } from '../form';
import { ModuleGate } from '../shared';
import { AudiencePicker } from '../../_components/audience-picker';

export const metadata = { title: 'New announcement' };

export default async function NewAnnouncementPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'announcements.create')) notFound();
  const base = await tenantBase(key);
  const [auds, settings] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id)]);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="announcements" name="Announcements">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/announcements`}>← Announcements</Link>
          </p>
          <h1>New announcement</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <AnnouncementForm
            tenantKey={key}
            id={null}
            status={null}
            canPublish={hasAnywhere(ctx, 'announcements.publish')}
            requireApproval={settings.requireApproval}
            timezone={tenant.timezone}
            audiencePicker={<AudiencePicker audiences={auds} selected={[]} visibility="public" />}
            defaults={{ title: '', summary: '', body: '', isUrgent: false, isPinned: false, publishAt: '', expiresAt: '' }}
          />
        </div>
      </section>
    </ModuleGate>
  );
}
