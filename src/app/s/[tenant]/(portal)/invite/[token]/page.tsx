import Link from 'next/link';
import { getPortalView, getSession, getTenantOr404, tenantBase } from '@/server/request';
import { viewInvitation } from '@/server/services/staff';
import { acceptExistingAction, acceptNewAccountAction } from './actions';
import { AcceptExistingButton, NewAccountForm } from './forms';

export const metadata = { title: 'Invitation', robots: { index: false } };

type Props = { params: Promise<{ tenant: string; token: string }> };

export default async function InvitePage({ params }: Props) {
  const { tenant: key, token } = await params;
  const tenant = await getTenantOr404(key);
  const [view, base, inv, session] = await Promise.all([getPortalView(tenant.id), tenantBase(key), viewInvitation(tenant.id, token), getSession()]);
  const school = view.profile.shortName ?? view.profile.displayName;
  const here = `${base}/invite/${token}`;

  let body: React.ReactNode;
  if (inv.state !== 'valid') {
    body = (
      <p>
        {inv.state === 'used'
          ? 'This invitation has already been used. '
          : inv.state === 'expired'
            ? 'This invitation has expired. '
            : 'This invitation link is not valid. '}
        Ask the school for a new one, or <Link href={`${base}/login`}>sign in</Link> if you already have access.
      </p>
    );
  } else if (session && session.user.email.toLowerCase() === inv.email) {
    body = (
      <>
        <p>
          You are signed in as <strong>{inv.email}</strong>.
        </p>
        <AcceptExistingButton run={acceptExistingAction.bind(null, key, token)} />
      </>
    );
  } else if (session) {
    body = (
      <p className="field-error" role="alert">
        You are signed in as {session.user.email}, but this invitation is for {inv.email}. Sign out and open this link again.
      </p>
    );
  } else if (inv.existingUser) {
    body = (
      <p>
        You already have an account with <strong>{inv.email}</strong>.{' '}
        <Link href={`${base}/login?next=${encodeURIComponent(here)}`}>Sign in to accept</Link>.
      </p>
    );
  } else {
    body = <NewAccountForm run={acceptNewAccountAction.bind(null, key, token)} email={inv.email} defaultName={inv.name} next={`${base}/admin`} />;
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <h1>Join {school}</h1>
        {inv.state === 'valid' && (
          <p>
            You have been invited to help manage the {school} family portal as <strong>{inv.roleName}</strong>.
          </p>
        )}
        {body}
      </div>
    </div>
  );
}
