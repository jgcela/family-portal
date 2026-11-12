import Link from 'next/link';
import { getPortalView, requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { AdminNavLink } from './nav-link';
import './admin.css';

type Props = { children: React.ReactNode; params: Promise<{ tenant: string }> };

export default async function AdminLayout({ children, params }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx, user } = await requireStaff(key);
  const [view, base] = await Promise.all([getPortalView(tenant.id), tenantBase(key)]);
  const a = `${base}/admin`;
  const sections: { title: string; items: { href: string; label: string; show: boolean }[] }[] = [
    { title: 'Overview', items: [{ href: a, label: 'Dashboard', show: true }] },
    {
      title: 'School life',
      items: [
        { href: `${a}/announcements`, label: 'Announcements', show: hasAnywhere(ctx, 'announcements.view') },
        { href: `${a}/calendar`, label: 'Calendar & Events', show: hasAnywhere(ctx, 'events.view') },
        { href: `${a}/pages`, label: 'School pages', show: hasAnywhere(ctx, 'pages.view') },
      ],
    },
    {
      title: 'People',
      items: [{ href: `${a}/roles`, label: 'Roles & Permissions', show: hasAnywhere(ctx, 'roles.view') }],
    },
    {
      title: 'Modules',
      items: [{ href: `${a}/modules`, label: 'Module Manager', show: hasAnywhere(ctx, 'modules.view') }],
    },
  ];
  const initials = (view.profile.shortName ?? view.profile.displayName)
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="admin">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="admin-side">
        <div className="admin-school">
          <span className="admin-school-mark" aria-hidden="true">
            {initials}
          </span>
          <div>
            <div className="admin-school-name">{view.profile.shortName ?? view.profile.displayName}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {user.name}
            </div>
          </div>
        </div>
        <nav className="admin-nav" aria-label="Administration">
          {sections.map((s) => {
            const items = s.items.filter((i) => i.show);
            if (!items.length) return null;
            return (
              <div key={s.title}>
                <h2>{s.title}</h2>
                <ul>
                  {items.map((i) => (
                    <li key={i.href}>
                      <AdminNavLink href={i.href}>{i.label}</AdminNavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div>
            <h2>Portal</h2>
            <ul>
              <li>
                <Link href={base || '/'}>View family portal</Link>
              </li>
            </ul>
          </div>
        </nav>
      </aside>
      <main id="main" className="admin-main">
        {children}
      </main>
    </div>
  );
}
