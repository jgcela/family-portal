import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, tenantBase } from '@/server/request';
import { listPublishedPages } from '@/server/services/content';

export const metadata = { title: 'School info' };

export default async function PagesIndex({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'pages')) notFound();
  const [rows, base] = await Promise.all([listPublishedPages(tenant.id), tenantBase(key)]);
  return (
    <div className="container content-page">
      <h1>School info</h1>
      {rows.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <ul className="page-index">
          {rows.map((r) => (
            <li key={r.slug}>
              <Link href={`${base}/p/${r.slug}`}>{r.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
