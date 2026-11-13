import 'server-only';
import { headers } from 'next/headers';
import { AuthorizationError } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/services/modules';
import { rootDomain } from '@/server/tenancy/config';
import { normalizeHost } from '@/server/tenancy/resolve';

export type PlatformResult = { ok?: string; error?: string; link?: string; schoolId?: string } | undefined;

export function platformError(err: unknown): PlatformResult {
  if (err instanceof ValidationError) return { error: err.message };
  if (err instanceof AuthorizationError) return { error: 'Your platform role does not allow that.' };
  console.error(err);
  return { error: 'Something went wrong. Please try again.' };
}

/** Where a school's portal lives, as seen from this request: its subdomain on the platform domain, or /s/<slug>. */
export async function portalUrl(slug: string): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const root = rootDomain();
  if (root !== 'localhost' && normalizeHost(host) === root) return `${proto}://${slug}.${root}`;
  return `${proto}://${host}/s/${slug}`;
}
