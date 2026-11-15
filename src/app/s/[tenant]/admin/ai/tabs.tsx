import Link from 'next/link';

const TABS = [
  ['', 'Knowledge base'],
  ['/test', 'Test'],
  ['/settings', 'Settings'],
  ['/quality', 'Quality & usage'],
] as const;

export function AiTabs({ base, current }: { base: string; current: (typeof TABS)[number][0] }) {
  return (
    <nav className="tabs" aria-label="AI Control Center">
      {TABS.map(([path, label]) => (
        <Link key={path} href={`${base}/admin/ai${path}`} aria-current={path === current ? 'page' : undefined} className={path === current ? 'tab tab-active' : 'tab'}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export const KIND_LABEL: Record<string, string> = {
  document: 'Document',
  page: 'School page',
  announcement: 'Announcement',
  calendar: 'Calendar (live)',
  volunteer: 'Volunteer',
  faq: 'FAQ',
  text: 'Text',
};
