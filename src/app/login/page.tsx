import { LoginForm } from './login-form';

export const metadata = { title: 'Platform sign in' };

export default async function PlatformLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith('/platform') ? sp.next : '/platform';
  return (
    <main id="main" className="container" style={{ paddingBlock: 'var(--space-8)', maxWidth: 460 }}>
      <div className="card" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Platform sign in</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
