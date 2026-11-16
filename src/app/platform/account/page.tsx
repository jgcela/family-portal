import { requirePlatformAdmin } from '@/server/request';
import { AccountSettings } from '@/app/_account/account-settings';

export const metadata = { title: 'Account settings' };
export const dynamic = 'force-dynamic';

export default async function PlatformAccount() {
  const { user } = await requirePlatformAdmin();
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Account settings</h1>
          <p>Your own name, phone, photo and password.</p>
        </div>
      </div>
      <AccountSettings userId={user.id} securityHref="/account/security" />
    </>
  );
}
