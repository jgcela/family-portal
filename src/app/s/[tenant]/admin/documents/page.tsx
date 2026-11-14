import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listDocumentsForStaff } from '@/server/services/documents';
import { StatusBadge } from '../calendar/shared';
import { formatInstant, ModuleGate } from '../announcements/shared';
import { fileLabel, formatBytes } from './shared';

export const metadata = { title: 'Documents' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ deleted?: string }> };

export default async function DocumentsAdmin({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'documents.view')) notFound();
  const base = await tenantBase(key);
  const { items, usage } = await listDocumentsForStaff(ctx);
  const sp = await searchParams;
  const pct = usage.limitBytes ? Math.min(100, Math.round((usage.usedBytes / usage.limitBytes) * 100)) : 0;
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="documents" name="Documents">
      <div className="admin-head">
        <div>
          <h1>Documents</h1>
          <p>
            Forms, policies, menus and other files. Each document has a permanent link you can paste into pages and
            announcements; uploading a new version keeps the same link.
          </p>
        </div>
        {hasAnywhere(ctx, 'documents.create') && hasAnywhere(ctx, 'documents.upload') && (
          <div className="btn-row">
            <Link className="btn btn-quiet btn-sm" href={`${base}/admin/documents/bulk`}>
              Upload several
            </Link>
            <Link className="btn btn-primary btn-sm" href={`${base}/admin/documents/new`}>
              Upload document
            </Link>
          </div>
        )}
      </div>
      {sp.deleted && <div className="notice notice-ok">Document and its files deleted.</div>}
      <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
        Storage used: {formatBytes(usage.usedBytes)} of {formatBytes(usage.limitBytes)} ({pct}%)
      </p>
      <section className="panel" aria-label="Documents">
        {items.length === 0 ? (
          <div className="panel-body">
            <p>No documents yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Category</th>
                  <th scope="col">File</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ doc, file }) => (
                  <tr key={doc.id}>
                    <td className="cell-title">
                      <Link href={`${base}/admin/documents/${doc.id}`}>{doc.title}</Link>
                      <div className="muted">/d/{doc.slug}</div>
                    </td>
                    <td className="muted">{doc.category ?? '—'}</td>
                    <td className="nowrap">{file ? `${fileLabel(file.contentType)} · ${formatBytes(file.sizeBytes)}` : '—'}</td>
                    <td className="nowrap">{formatInstant(doc.updatedAt, tenant.timezone)}</td>
                    <td>
                      <StatusBadge status={doc.status} />
                      {doc.visibility !== 'public' && <div className="muted">{doc.visibility === 'staff' ? 'Staff only' : 'Families only'}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ModuleGate>
  );
}
