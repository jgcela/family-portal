import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, tenantBase , getViewer } from '@/server/request';
import { listPublicAnnouncements } from '@/server/services/content';
import { AnnouncementList } from './announcement-list';

export const metadata = { title: 'School updates' };

export default async function UpdatesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'announcements')) notFound();
  const [items, base] = await Promise.all([listPublicAnnouncements(tenant.id, await getViewer(tenant.id), { limit: 100 }), tenantBase(key)]);
  return (
    <div className="container content-page">
      <h1>School updates</h1>
      <AnnouncementList items={items} base={base} tz={tenant.timezone} emptyText="No updates right now." />
    </div>
  );
}
