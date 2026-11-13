// Where to go after signing in: staff to the dashboard, families to the
// portal, everyone else to the join page (which explains their status).
import { redirect } from 'next/navigation';
import { getSession, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { loadAuthzContext } from '@/server/rbac/context';
import { hasAnywhere } from '@/server/rbac/authorize';

export default async function AccountRedirect({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const base = await tenantBase(key);
  const session = await getSession();
  if (!session) redirect(`${base}/login`);
  const ctx = await loadAuthzContext(tenant.id, session.user.id);
  if (hasAnywhere(ctx, 'dashboard.view')) redirect(`${base}/admin`);
  const viewer = await getViewer(tenant.id);
  redirect(viewer.kind === 'family' ? base || '/' : `${base}/join`);
}
