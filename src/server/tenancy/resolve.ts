// Host -> tenant resolution. Pure parsing here; DB lookup in tenants.ts.

export const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'platform', 'api', 'app', 'auth', 'mail', 'status']);

export type HostResolution =
  | { kind: 'root' }
  | { kind: 'subdomain'; slug: string }
  | { kind: 'custom'; hostname: string };

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SUBDOMAINS.has(slug);
}

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

export function resolveHost(rawHost: string | null | undefined, root: string): HostResolution {
  const host = normalizeHost(rawHost);
  const rootHost = normalizeHost(root);
  if (!host || host === rootHost || host === `www.${rootHost}` || host === '127.0.0.1') return { kind: 'root' };
  if (host.endsWith(`.${rootHost}`)) {
    const sub = host.slice(0, -(rootHost.length + 1));
    if (!sub.includes('.') && isValidSlug(sub)) return { kind: 'subdomain', slug: sub };
    return { kind: 'root' };
  }
  // Preview deployments (e.g. *.vercel.app) behave like the root host.
  if (host.endsWith('.vercel.app')) return { kind: 'root' };
  return { kind: 'custom', hostname: host };
}
