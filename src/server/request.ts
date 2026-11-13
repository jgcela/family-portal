// Per-request helpers for server components and server actions.
import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { auth } from './auth/auth';
import { platformDb, withTenant } from './db/client';
import { homepageVersions, navigationItems, platformAdmins, schoolProfiles } from './db/schema';
import { hasAnywhere, type AuthzContext } from './rbac/authorize';
import { loadAuthzContext } from './rbac/context';
import { getModuleState } from './services/modules';
import { getPublishedTheme, getThemeDraftTokens } from './services/theme';
import { getHomepageDraftBlocks } from './services/homepage';
import { homepageSchema } from './tenancy/homepage-defaults';
import { findTenantByKey, isServable } from './tenancy/tenants';
import { loadViewer, type Viewer } from './viewer';

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
  // Read the request headers first: that marks the page as dynamic, so the
  // build never tries to prerender it (and never needs a database).
  const h = await headers();
  return auth().api.getSession({ headers: h });
});

/** The portal viewer for this request (public, family or staff), resolved on the server. */
export const getViewer = cache(async (tenantId: string): Promise<Viewer> => {
  const session = await getSession();
  return loadViewer(tenantId, session?.user.id);
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

/** Cookie holding the tenant id whose drafts the signed-in editor is previewing. */
export const PREVIEW_COOKIE = 'fp_preview';

/**
 * What the family portal should render for this request. Normally the
 * published view; for an editor who turned on preview, their school's draft
 * theme and homepage instead. Permission is re-checked on every request, so a
 * stale cookie alone never reveals drafts.
 */
export const getDisplayView = cache(async (tenantId: string) => {
  const view = await getPortalView(tenantId);
  const none = { ...view, preview: null as null | { theme: boolean; homepage: boolean } };
  const jar = await cookies();
  if (jar.get(PREVIEW_COOKIE)?.value !== tenantId) return none;
  const session = await getSession();
  if (!session) return none;
  const ctx = await loadAuthzContext(tenantId, session.user.id);
  const canTheme = hasAnywhere(ctx, 'branding.manage');
  const canHome = hasAnywhere(ctx, 'homepage.edit');
  if (!canTheme && !canHome) return none;
  const [theme, homepage] = await Promise.all([
    canTheme ? getThemeDraftTokens(tenantId) : null,
    canHome ? getHomepageDraftBlocks(tenantId) : null,
  ]);
  return {
    ...view,
    theme: theme ?? view.theme,
    homepage: homepage ?? view.homepage,
    preview: { theme: !!theme, homepage: !!homepage },
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
