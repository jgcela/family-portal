import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404 } from '@/server/request';
import { getPublishedPage } from '@/server/services/content';
import { renderMarkdown } from '@/server/content/markdown';

type Props = { params: Promise<{ tenant: string; slug: string }> };

async function load(props: Props) {
  const { tenant: key, slug } = await props.params;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'pages')) notFound();
  const row = await getPublishedPage(tenant.id, slug);
  if (!row) notFound();
  return row;
}

export async function generateMetadata(props: Props) {
  return { title: (await load(props)).version.title };
}

export default async function SchoolPage(props: Props) {
  const { version } = await load(props);
  const { html, toc } = renderMarkdown(version.body);
  const showToc = version.showToc && toc.length > 1;
  return (
    <div className={`container content-page${showToc ? ' has-toc' : ''}`}>
      <h1>{version.title}</h1>
      <div className="page-layout">
        {showToc && (
          <nav className="toc" aria-label="On this page">
            <details open>
              <summary>On this page</summary>
              <ol>
                {toc.map((t) => (
                  <li key={t.id} className={t.level === 3 ? 'toc-sub' : undefined}>
                    <a href={`#${t.id}`}>{t.text}</a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>
        )}
        {/* Safe: renderMarkdown never emits raw HTML from the source. */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
