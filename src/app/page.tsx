import Link from 'next/link';

export default function PlatformHome() {
  return (
    <main id="main" className="container" style={{ paddingBlock: 'var(--space-8)', maxWidth: 720 }}>
      <p className="badge">Platform</p>
      <h1 style={{ marginTop: 'var(--space-4)' }}>{process.env.PLATFORM_NAME ?? 'School Portal'}</h1>
      <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
        Each school has its own portal address. If you are a parent or staff member, use the link your school
        sent you.
      </p>
      <p style={{ marginTop: 'var(--space-5)' }}>
        <Link className="btn btn-quiet" href="/platform">
          Platform administration
        </Link>
      </p>
    </main>
  );
}
