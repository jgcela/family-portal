// pg treats sslmode=prefer/require/verify-ca as verify-full today and warns
// that the next major version will switch to weaker libpq meanings. Pin the
// current, strict behaviour (encrypted and certificate checked, which Neon
// supports) without asking anyone to edit DATABASE_URL. URLs without TLS
// settings (local development, tests) are left as they are.
const WEAK = new Set(['prefer', 'require', 'verify-ca']);

export function strictSslUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const mode = u.searchParams.get('sslmode');
  if (!mode || !WEAK.has(mode) || u.searchParams.get('uselibpqcompat') === 'true') return url;
  u.searchParams.set('sslmode', 'verify-full');
  return u.toString();
}
