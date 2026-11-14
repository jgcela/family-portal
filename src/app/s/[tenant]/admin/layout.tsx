import { getPortalView, requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { AdminShell } from '@/app/_shell/admin-shell';
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
        { href: `${a}/messenger`, label: 'School Messenger', show: hasAnywhere(ctx, 'announcements.view') },
        { href: `${a}/calendar`, label: 'Calendar & Events', show: hasAnywhere(ctx, 'events.view') },
        { href: `${a}/pages`, label: 'School pages', show: hasAnywhere(ctx, 'pages.view') },
        { href: `${a}/documents`, label: 'Documents', show: hasAnywhere(ctx, 'documents.view') },
        { href: `${a}/volunteer`, label: 'Volunteer', show: hasAnywhere(ctx, 'volunteer.view') },
        { href: `${a}/community`, label: 'Community', show: hasAnywhere(ctx, 'community.view') },
      ],
    },
    {
      title: 'Portal design',
      items: [
        { href: `${a}/design/theme`, label: 'Theme', show: hasAnywhere(ctx, 'branding.manage') },
        { href: `${a}/design/homepage`, label: 'Homepage', show: hasAnywhere(ctx, 'homepage.edit') },
        { href: `${a}/links`, label: 'Links', show: hasAnywhere(ctx, 'navigation.manage') },
      ],
    },
    {
      title: 'People',
      items: [
        { href: `${a}/staff`, label: 'Staff', show: hasAnywhere(ctx, 'users.view') },
        { href: `${a}/families`, label: 'Families', show: hasAnywhere(ctx, 'users.view') },
        { href: `${a}/roles`, label: 'Roles & Permissions', show: hasAnywhere(ctx, 'roles.view') },
      ],
    },
    {
      title: 'Modules',
      items: [{ href: `${a}/modules`, label: 'Module Manager', show: hasAnywhere(ctx, 'modules.view') }],
    },
    {
      title: 'Settings',
      items: [
        { href: `${a}/domains`, label: 'Domains', show: !ctx.support && hasAnywhere(ctx, 'domains.manage') },
        { href: `${a}/support`, label: 'Support access', show: !ctx.support && hasAnywhere(ctx, 'support.grant') },
      ],
    },
  ];
  const initials = (view.profile.shortName ?? view.profile.displayName)
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const groups = sections
    .map((s) => ({
      title: s.title,
      items: s.items.filter((i) => i.show).map((i) => ({ href: i.href, label: i.label, exact: i.href === a })),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <AdminShell
      mark={{ text: initials }}
      title={view.profile.shortName ?? view.profile.displayName}
      subtitle="School admin"
      groups={groups}
      navLabel="Administration"
      userName={user.name}
      portalHref={base || '/'}
      banner={
        ctx.support && (
          <p className="notice support-banner" role="status">
            <strong>Platform support session.</strong> Read-only access approved by the school, until{' '}
            {ctx.support.expiresAt.toLocaleString('en-US', { timeZone: tenant.timezone, dateStyle: 'medium', timeStyle: 'short' })}. Every visit is recorded in
            the school&rsquo;s activity log.
          </p>
        )
      }
    >
      {children}
    </AdminShell>
  );
}
