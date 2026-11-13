'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sidebar link; marks the current section (exact match for the overview, prefix for the rest). */
export function PlatformNavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  );
}
