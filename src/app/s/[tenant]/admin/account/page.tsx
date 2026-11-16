import { getPortalView, requireStaff } from '@/server/request';
import { AccountSettings } from '@/app/_account/account-settings';

export const metadata = { title: 'Account settings' };
export const dynamic = 'force-dynamic';

export default async function AdminAccount({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant, user } = await requireStaff((await params).tenant);
  const view = await getPortalView(tenant.id);
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Account settings</h1>
          <p>Your own name, phone, photo and password. They apply wherever you use this account.</p>
        </div>
      </div>
      <AccountSettings userId={user.id} schoolName={view.profile.shortName ?? view.profile.displayName} />
    </>
  );
}
