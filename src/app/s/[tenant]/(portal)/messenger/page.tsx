import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { listPublicIssues } from '@/server/services/messenger';

export const metadata = { title: 'School Messenger' };

const longDate = (d: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ q?: string; date?: string }> };

export default async function MessengerArchive({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'messenger')) notFound();
  const [all, base] = await Promise.all([listPublicIssues(tenant.id, await getViewer(tenant.id)), tenantBase(key)]);
  const sp = await searchParams;
  // Old links point to an issue by its date (messenger.html?date=2026-11-09).
  if (sp.date) {
    const hit = all.find((i) => i.issueDate === sp.date);
    if (hit) redirect(`${base}/messenger/${hit.id}`);
  }
  const q = (sp.q ?? '').trim().slice(0, 100);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const items = words.length
    ? all.filter((i) => {
        const text = [i.title, i.excerpt ?? '', ...i.highlights, longDate(i.issueDate)].join(' ').toLowerCase();
        return words.every((w) => text.includes(w));
      })
    : all;
  return (
    <div className="container content-page">
      <h1>School Messenger</h1>
      <p className="muted">Every weekly Messenger, newest first.</p>
      <form className="messenger-search" role="search" action={`${base}/messenger`}>
        <label htmlFor="mq" className="visually-hidden">
          Search the Messenger
        </label>
        <input id="mq" name="q" type="search" defaultValue={q} placeholder="Search titles and highlights" />
        <button className="btn btn-primary btn-sm" type="submit">
          Search
        </button>
        {q && <Link href={`${base}/messenger`}>Clear</Link>}
      </form>
      {items.length === 0 ? (
        <p className="muted">{q ? `No issues match “${q}”.` : 'No issues yet.'}</p>
      ) : (
        <ol className="messenger-list">
          {items.map((i, n) => (
            <li key={i.id} className="vol-card">
              <p className="muted messenger-date">
                {longDate(i.issueDate)}
                {n === 0 && !q && <span className="messenger-latest">Latest</span>}
              </p>
              <h2 className="messenger-title">
                <Link href={`${base}/messenger/${i.id}`}>{i.title}</Link>
              </h2>
              {i.excerpt && <p>{i.excerpt}</p>}
              {i.highlights.length > 0 && (
                <ul className="messenger-highlights">
                  {i.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
