// Applies the school's published theme to everything under its portal.
import type { Metadata } from 'next';
import { getPortalView, getTenantOr404, isServable } from '@/server/request';
import { themeToCss } from '@/server/theme/tokens';

type Props = { children: React.ReactNode; params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getTenantOr404((await params).tenant);
  const view = await getPortalView(tenant.id);
  return {
    title: { default: `Family Portal · ${view.profile.displayName}`, template: `%s · ${view.profile.displayName}` },
    icons: view.theme.logo.favicon ? [{ url: view.theme.logo.favicon }] : undefined,
  };
}

export default async function TenantLayout({ children, params }: Props) {
  const tenant = await getTenantOr404((await params).tenant);
  if (!isServable(tenant)) {
    return (
      <main id="main" className="container" style={{ paddingBlock: 'var(--space-8)' }}>
        <h1>This portal is temporarily unavailable</h1>
        <p style={{ marginTop: 'var(--space-3)' }}>Please contact the school office directly.</p>
      </main>
    );
  }
  const view = await getPortalView(tenant.id);
  // themeToCss only emits validated hex colours and whitelisted font stacks.
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(view.theme) }} />
      {children}
    </>
  );
}
