'use client';
// Shown when a page fails on the server. Never shows the error itself: in
// production Next.js passes only an opaque digest, which the office can quote
// so we can find the matching server log.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="container" style={{ paddingBlock: 'var(--space-8)', maxWidth: 560 }}>
      <div className="card" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Something went wrong</h1>
        <p>This page could not load. Please try again in a moment. If it keeps happening, contact the school office.</p>
        {error.digest && <p className="muted">Reference: {error.digest}</p>}
        <p>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
        </p>
      </div>
    </main>
  );
}
