import { redirect } from 'next/navigation';
import { getPortalView, getSession, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { AccountSettings } from '@/app/_account/account-settings';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function FamilySettings({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const base = await tenantBase(key);
  const session = await getSession();
  if (!session) redirect(`${base}/login?next=${encodeURIComponent(`${base}/settings`)}`);
  const viewer = await getViewer(tenant.id);
  if (viewer.kind !== 'family') redirect(`${base}/account`);
  const view = await getPortalView(tenant.id);
  return (
    <div className="ws-page">
      <p className="ws-eyebrow">Your account</p>
      <h1 className="ws-h1">Settings.</h1>
      <p className="ws-sub">Your name, phone, photo and password.</p>
      <AccountSettings userId={session.user.id} schoolName={view.profile.shortName ?? view.profile.displayName} />
    </div>
  );
}
