import { safeNext } from '@/lib/safe-next';
import { LoginForm } from './login-form';

export const metadata = { title: 'Platform sign in' };

export default async function PlatformLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  // Back into the platform, or to the account security page (two-step sign-in setup).
  const next = sp.next?.startsWith('/account') ? safeNext(sp.next, '/account', '/platform') : safeNext(sp.next, '/platform', '/platform');
  return (
    <main id="main" className="container" style={{ paddingBlock: 'var(--space-8)', maxWidth: 460 }}>
      <div className="card" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Platform sign in</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
