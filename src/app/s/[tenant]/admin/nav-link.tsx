'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AdminNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // In subdomain mode the browser path has no /s/<slug> prefix; compare suffixes.
  const current = pathname === href || pathname.endsWith(href.replace(/^\/s\/[^/]+/, '') || '/');
  return (
    <Link href={href} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  );
}
