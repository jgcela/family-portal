import { getPortalView, getTenantOr404, tenantBase } from '@/server/request';
import { LoginForm } from '@/app/login/login-form';

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ next?: string; error?: string }> };

export const metadata = { title: 'Sign in' };

export default async function TenantLogin({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, base, sp] = await Promise.all([getPortalView(tenant.id), tenantBase(key), searchParams]);
  // Only allow redirects back into this portal.
  const next = sp.next && sp.next.startsWith(`${base}/`) && !sp.next.startsWith('//') ? sp.next : `${base}/admin`;
  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <h1>Sign in to {view.profile.shortName ?? view.profile.displayName}</h1>
        {sp.error === 'forbidden' && (
          <p className="field-error" role="alert">
            Your account does not have access to manage this portal. Ask your school administrator for access.
          </p>
        )}
        <LoginForm next={next} />
      </div>
    </div>
  );
}
