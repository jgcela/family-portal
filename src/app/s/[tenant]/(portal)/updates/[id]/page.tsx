import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, tenantBase , getViewer } from '@/server/request';
import { getPublicAnnouncement } from '@/server/services/content';
import { renderMarkdown } from '@/server/content/markdown';

type Props = { params: Promise<{ tenant: string; id: string }> };

async function load(props: Props) {
  const { tenant: key, id } = await props.params;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'announcements')) notFound();
  const row = await getPublicAnnouncement(tenant.id, id, await getViewer(tenant.id));
  if (!row) notFound();
  return { key, tenant, row };
}

export async function generateMetadata(props: Props) {
  return { title: (await load(props)).row.title };
}

export default async function AnnouncementPage(props: Props) {
  const { key, tenant, row } = await load(props);
  const base = await tenantBase(key);
  const { html } = renderMarkdown(row.body);
  const posted = row.publishAt ?? row.publishedAt;
  return (
    <div className="container content-page">
      <p>
        <Link href={`${base}/updates`}>← All updates</Link>
      </p>
      <article className="card article">
        <p className="update-meta">
          {row.isUrgent && <span className="urgent-tag">Urgent</span>}
          {posted && <span>{new Intl.DateTimeFormat('en-US', { timeZone: tenant.timezone, dateStyle: 'long' }).format(posted)}</span>}
        </p>
        <h1>{row.title}</h1>
        {/* Safe: renderMarkdown never emits raw HTML from the source. */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
}
