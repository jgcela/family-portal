'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function SignOutButton({ to }: { to: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="portal-signout"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        window.location.assign(to);
      }}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
