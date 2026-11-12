// Per-request helpers for server components and server actions.
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { auth } from './auth/auth';
import { platformDb, withTenant } from './db/client';
import { homepageVersions, navigationItems, platformAdmins, schoolProfiles } from './db/schema';
import { hasAnywhere, type AuthzContext } from './rbac/authorize';
import { loadAuthzContext } from './rbac/context';
import { getModuleState } from './services/modules';
import { getPublishedTheme } from './services/theme';
import { homepageSchema } from './tenancy/homepage-defaults';
import { findTenantByKey, isServable } from './tenancy/tenants';

const TENANT_BASE_HEADER = 'x-fp-tenant-base';

export const getTenantOr404 = cache(async (key: string) => {
  const tenant = await findTenantByKey(decodeURIComponent(key));
  if (!tenant) notFound();
  return tenant;
});

/** Base path for links inside a school's portal ('' on its own host, '/s/slug' in path mode). */
export async function tenantBase(key: string): Promise<string> {
  const h = await headers();
  return h.get(TENANT_BASE_HEADER) ?? `/s/${key}`;
}

export const getSession = cache(async () => {
  return auth().api.getSession({ headers: await headers() });
});

export const getPortalView = cache(async (tenantId: string) => {
  const [theme, modules, data] = await Promise.all([
    getPublishedTheme(tenantId),
    getModuleState(tenantId),
    withTenant(tenantId, async (tx) => {
      const [profile] = await tx.select().from(schoolProfiles).where(eq(schoolProfiles.tenantId, tenantId));
      const [home] = await tx
        .select()
        .from(homepageVersions)
        .where(and(eq(homepageVersions.tenantId, tenantId), eq(homepageVersions.status, 'published')));
      const nav = await tx
        .select()
        .from(navigationItems)
        .where(and(eq(navigationItems.tenantId, tenantId), eq(navigationItems.isActive, true)))
        .orderBy(asc(navigationItems.position));
      return { profile, home, nav };
    }),
  ]);
  const blocks = homepageSchema.safeParse(data.home?.blocks);
  return {
    theme,
    profile: data.profile!,
    activeModules: modules.active,
    homepage: blocks.success ? blocks.data : [],
    customNav: data.nav,
  };
});

export type StaffContext = { ctx: AuthzContext; user: { id: string; name: string; email: string } };

/** For admin pages: signed in, active member, allowed into the dashboard. */
export async function requireStaff(tenantKey: string): Promise<StaffContext & { tenant: Awaited<ReturnType<typeof getTenantOr404>> }> {
  const tenant = await getTenantOr404(tenantKey);
  const base = await tenantBase(tenantKey);
  const session = await getSession();
  if (!session) redirect(`${base}/login?next=${encodeURIComponent(`${base}/admin`)}`);
  const ctx = await loadAuthzContext(tenant.id, session.user.id);
  if (!ctx || !hasAnywhere(ctx, 'dashboard.view')) redirect(`${base}/login?error=forbidden`);
  return { tenant, ctx, user: session.user };
}

export async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) redirect('/login?next=/platform');
  const [admin] = await platformDb().select().from(platformAdmins).where(eq(platformAdmins.userId, session.user.id));
  if (!admin) notFound();
  return { user: session.user, role: admin.role };
}

export { isServable };
