import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { getPublicIssue, listPublicIssues } from '@/server/services/messenger';
import { IssueFrame } from '../issue-frame';

export const metadata = { title: 'School Messenger' };

const longDate = (d: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

export default async function MessengerIssue({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: key, id } = await params;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'messenger')) notFound();
  const viewer = await getViewer(tenant.id);
  const [issue, all, base] = await Promise.all([getPublicIssue(tenant.id, id, viewer), listPublicIssues(tenant.id, viewer), tenantBase(key)]);
  if (!issue) notFound();
  const at = all.findIndex((i) => i.id === issue.id);
  const newer = at > 0 ? all[at - 1] : null;
  const older = at >= 0 && at < all.length - 1 ? all[at + 1] : null;
  return (
    <div className="container content-page">
      <p>
        <Link href={`${base}/messenger`}>← All issues</Link>
      </p>
      <p className="muted messenger-date">{longDate(issue.issueDate)}</p>
      <h1>{issue.title}</h1>
      <IssueFrame src={`${base}/messenger-raw/${issue.id}`} title={`School Messenger, ${longDate(issue.issueDate)}`} />
      <nav className="messenger-pager" aria-label="Other issues">
        {older ? (
          <Link href={`${base}/messenger/${older.id}`}>← {longDate(older.issueDate)}</Link>
        ) : (
          <span />
        )}
        {newer && <Link href={`${base}/messenger/${newer.id}`}>{longDate(newer.issueDate)} →</Link>}
      </nav>
    </div>
  );
}
