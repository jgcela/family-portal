import type { listPublicDocuments } from '@/server/services/documents';
import { fileLabel, formatBytes } from '../../admin/documents/shared';
import type { DocItem } from './doc-groups';

type Rows = Awaited<ReturnType<typeof listPublicDocuments>>;

export function toDocItems(rows: Rows): DocItem[] {
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    category: r.category ?? 'Other',
    meta: `${fileLabel(r.contentType)} · ${formatBytes(r.sizeBytes)}`,
  }));
}
