'use client';
// Last resort when even the root layout fails. Plain HTML, no internal details.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 560 }}>
        <h1>Something went wrong</h1>
        <p>This page could not load. Please try again in a moment.</p>
        {error.digest && <p>Reference: {error.digest}</p>}
      </body>
    </html>
  );
}
