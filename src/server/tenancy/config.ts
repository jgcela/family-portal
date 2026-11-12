// Platform host configuration, read from environment variables.

/** e.g. "schoolportal.app" in production, "localhost" in development. */
export function rootDomain(): string {
  return (process.env.PLATFORM_ROOT_DOMAIN ?? 'localhost').toLowerCase();
}

/** Path-based tenants (/s/<slug>) for hosts without wildcard DNS, e.g. *.vercel.app. */
export function pathTenantsAllowed(): boolean {
  return process.env.ALLOW_PATH_TENANTS !== 'false';
}

export function allowedAuthHosts(): string[] {
  const root = rootDomain();
  const extra = (process.env.AUTH_EXTRA_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const hosts = [root, `*.${root}`, ...extra];
  if (root === 'localhost') hosts.push('localhost:*', '*.localhost:*', '127.0.0.1:*');
  return hosts;
}
