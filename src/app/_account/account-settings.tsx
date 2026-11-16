// Account settings, shared by the family workspace, the school admin and the platform.
import Link from 'next/link';
import { getProfile } from '@/server/services/account';
import { PasswordForm } from './password-form';
import { PhotoForm, ProfileForm } from './forms';
import './account.css';

export async function AccountSettings({ userId, schoolName, securityHref }: { userId: string; schoolName?: string; securityHref?: string }) {
  const p = await getProfile(userId);
  return (
    <div className="acct-settings">
      <section className="acct-card" aria-labelledby="acct-h-photo">
        <h2 id="acct-h-photo">Photo</h2>
        <PhotoForm name={p.name} image={p.image} />
      </section>
      <section className="acct-card" aria-labelledby="acct-h-profile">
        <h2 id="acct-h-profile">Your details</h2>
        <ProfileForm name={p.name} phone={p.phone ?? ''} />
      </section>
      <section className="acct-card" aria-labelledby="acct-h-email">
        <h2 id="acct-h-email">Email</h2>
        <p className="acct-email">{p.email}</p>
        <p className="hint">
          You sign in with this address. To change it, contact {schoolName ? `${schoolName}’s office` : 'the platform team'}: changing it here needs a
          confirmation email, which is not switched on yet.
        </p>
      </section>
      <section className="acct-card" aria-labelledby="acct-h-pw">
        <h2 id="acct-h-pw">Password</h2>
        <PasswordForm />
      </section>
      {securityHref && (
        <section className="acct-card" aria-labelledby="acct-h-2fa">
          <h2 id="acct-h-2fa">Two-step sign-in</h2>
          <p className="hint">A code from an authenticator app each time you sign in.</p>
          <Link href={securityHref}>Manage two-step sign-in</Link>
        </section>
      )}
    </div>
  );
}
