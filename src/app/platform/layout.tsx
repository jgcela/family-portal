import { requirePlatformAdmin } from '@/server/request';
import { AdminShell, type ShellGroup } from '@/app/_shell/admin-shell';
import '../s/[tenant]/admin/admin.css';

export const metadata = { title: { default: 'Platform', template: '%s · Platform' } };

/** Super Admin shell. Separate from every school's dashboard; platform roles only. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requirePlatformAdmin();
  const name = process.env.PLATFORM_NAME ?? 'School Portal';
  const groups: ShellGroup[] = [
    {
      title: 'Schools',
      items: [
        { href: '/platform', label: 'All schools', exact: true },
        ...(role !== 'support' ? [{ href: '/platform/schools/new', label: 'New school' }] : []),
      ],
    },
    { title: 'System health', items: [{ href: '/platform/health', label: 'System health' }] },
    { title: 'Plans', items: [{ href: '/platform/plans', label: 'Plans & modules' }] },
    { title: 'Team', items: [{ href: '/platform/team', label: 'Platform team' }] },
    { title: 'Activity', items: [{ href: '/platform/activity', label: 'Activity log' }] },
  ];
  return (
    <AdminShell
      mark={{ text: name.slice(0, 1).toUpperCase(), tone: 'ink' }}
      title={name}
      subtitle="Platform admin"
      groups={groups}
      navLabel="Platform administration"
      userName={user.name}
      userDetail={role}
    >
      {children}
    </AdminShell>
  );
}
