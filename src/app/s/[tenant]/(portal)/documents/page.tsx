import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, tenantBase, getViewer } from '@/server/request';
import { listPublicDocuments } from '@/server/services/documents';
import { DocGroups } from './doc-groups';
import { toDocItems } from './doc-items';

export const metadata = { title: 'Documents' };

/** Published documents this viewer may see, grouped by category. ?q= pre-fills the filter (from the homepage search box). */
export default async function DocumentsIndex({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ q?: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'documents')) notFound();
  const [rows, base, sp] = await Promise.all([listPublicDocuments(tenant.id, await getViewer(tenant.id)), tenantBase(key), searchParams]);
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 100) : '';
  return (
    <div className="container content-page">
      <h1>Documents</h1>
      <DocGroups items={toDocItems(rows)} base={base} initialQuery={q} />
    </div>
  );
}
