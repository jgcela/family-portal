import Link from 'next/link';
import { getPortalView, getSession, getTenantOr404, tenantBase } from '@/server/request';
import { getJoinPageInfo, myFamilyStatus } from '@/server/services/families';
import { ExistingFamilyForm, NewFamilyForm } from './forms';
import { joinWithExistingAccountAction, joinWithNewAccountAction } from './actions';

export const metadata = { title: 'Family account' };

export default async function JoinPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, base, session, info] = await Promise.all([getPortalView(tenant.id), tenantBase(key), getSession(), getJoinPageInfo(tenant.id)]);
  const school = view.profile.shortName ?? view.profile.displayName;
  const status = session ? await myFamilyStatus(tenant.id, session.user.id) : null;

  let body: React.ReactNode;
  if (status?.state === 'family') {
    body = (
      <p>
        Your family account is active. <Link href={base || '/'}>Go to the portal</Link>.
      </p>
    );
  } else if (status?.state === 'staff') {
    body = (
      <p>
        You are signed in as staff. <Link href={`${base}/admin`}>Open the dashboard</Link>.
      </p>
    );
  } else if (status?.state === 'pending') {
    body = (
      <>
        <p>
          <strong>Thanks, we have your request.</strong> The school office will check it and approve your account. Once
          approved, you will see family information here when you sign in.
        </p>
        <p className="muted">Until then you can use the public parts of the portal.</p>
      </>
    );
  } else if (status?.state === 'suspended' || status?.state === 'rejected') {
    body = <p>Your family account is not active. Please contact the school office.</p>;
  } else if (!info.open) {
    body = <p>{school} is not accepting new family accounts online right now. Please contact the school office.</p>;
  } else if (session) {
    body = (
      <>
        <p>
          Signed in as <strong>{session.user.email}</strong>. Ask {school} to link this account to your family.
        </p>
        <ExistingFamilyForm run={joinWithExistingAccountAction.bind(null, key)} grades={info.grades} />
      </>
    );
  } else {
    body = (
      <>
        <p>
          Create a family account to see information for your children&rsquo;s grades. The school office approves each
          account. Already have one? <Link href={`${base}/login?next=${encodeURIComponent(`${base}/account`)}`}>Sign in</Link>.
        </p>
        <NewFamilyForm run={joinWithNewAccountAction.bind(null, key)} grades={info.grades} next={`${base}/join`} />
      </>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <h1>Family account</h1>
        {body}
      </div>
    </div>
  );
}
