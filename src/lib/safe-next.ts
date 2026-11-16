// Where to send someone after signing in. Only paths inside `prefix` on this
// site are allowed: never another site, including the tricks browsers turn
// into one ("//evil.example", "/\evil.example", or a tab or newline hidden in
// the path).
export function safeNext(next: string | undefined | null, prefix: string, fallback: string): string {
  if (!next || next.length > 2000) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  const p = prefix.replace(/\/+$/, '');
  if (p && next !== p && !next.startsWith(`${p}/`) && !next.startsWith(`${p}?`)) return fallback;
  return next;
}

/** A link a school typed: a path on this site ("/calendar") or an https:// address. */
export const LOCAL_OR_HTTPS = /^(\/(?![/\\])|https:\/\/)/;
