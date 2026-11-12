import Link from 'next/link';
import { excerpt } from '@/server/content/markdown';

type Item = { id: string; title: string; summary: string | null; body: string; isUrgent: boolean; isPinned: boolean; publishAt: Date | null; publishedAt: Date | null };

export function formatPosted(d: Date | null, tz: string) {
  return d ? new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(d) : '';
}

export function AnnouncementList({ items, base, tz, emptyText }: { items: Item[]; base: string; tz: string; emptyText: string }) {
  if (!items.length) return <p className="empty">{emptyText}</p>;
  return (
    <ul className="updates">
      {items.map((a) => (
        <li key={a.id} className={a.isUrgent ? 'update is-urgent' : 'update'}>
          <p className="update-meta">
            {a.isUrgent && <span className="urgent-tag">Urgent</span>}
            {a.isPinned && !a.isUrgent && <span className="cat-tag">Pinned</span>}
            <span>{formatPosted(a.publishAt ?? a.publishedAt, tz)}</span>
          </p>
          <h3>
            <Link href={`${base}/updates/${a.id}`}>{a.title}</Link>
          </h3>
          <p className="update-summary">{a.summary || excerpt(a.body)}</p>
        </li>
      ))}
    </ul>
  );
}
