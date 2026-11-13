import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, tenantBase, getViewer } from '@/server/request';
import { listPublicDocuments } from '@/server/services/documents';
import { fileLabel, formatBytes } from '../../admin/documents/shared';

export const metadata = { title: 'Documents' };

/** Published, whole-school documents grouped by category. Files open through the stable /d/ link. */
export default async function DocumentsIndex({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'documents')) notFound();
  const [rows, base] = await Promise.all([listPublicDocuments(tenant.id, await getViewer(tenant.id)), tenantBase(key)]);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.category ?? 'Other';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  // Named categories first (alphabetical), "Other" last.
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  return (
    <div className="container content-page">
      <h1>Documents</h1>
      {rows.length === 0 ? (
        <p className="empty">No documents yet.</p>
      ) : (
        ordered.map(([cat, items]) => (
          <section key={cat} className="doc-group" aria-labelledby={`cat-${cat}`}>
            {ordered.length > 1 && <h2 id={`cat-${cat}`}>{cat}</h2>}
            <ul className="doc-list">
              {items.map((d) => (
                <li key={d.slug}>
                  {/* Plain link: /d/ is a redirect to a short-lived file URL, so it must not be prefetched. */}
                  <a href={`${base}/d/${d.slug}`} target="_blank" rel="noopener">
                    <span className="doc-title">{d.title}</span>
                    <span className="doc-meta">
                      {fileLabel(d.contentType)} · {formatBytes(d.sizeBytes)}
                    </span>
                  </a>
                  {d.description && <p className="doc-desc">{d.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
