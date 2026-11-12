// Tenant routing. Runs before every page request.
//   stmary.<root>/calendar   -> /s/stmary/calendar        (subdomain)
//   portal.school.org/x      -> /s/portal.school.org/x    (custom domain; verified in the layout)
//   <root>/s/stmary/...      -> unchanged                 (path mode, e.g. on *.vercel.app)
// The resolved base path is passed to pages in a request header that clients
// cannot inject (any incoming copy is removed first).
import { NextResponse, type NextRequest } from 'next/server';
import { resolveHost } from './server/tenancy/resolve';
import { pathTenantsAllowed, rootDomain } from './server/tenancy/config';

export const TENANT_BASE_HEADER = 'x-fp-tenant-base';

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete(TENANT_BASE_HEADER);

  const res = resolveHost(request.headers.get('host'), rootDomain());
  const isTenantPath = url.pathname === '/s' || url.pathname.startsWith('/s/');

  if (res.kind === 'root') {
    if (isTenantPath && !pathTenantsAllowed()) return new NextResponse('Not found', { status: 404 });
    if (isTenantPath) {
      const slug = url.pathname.split('/')[2] ?? '';
      headers.set(TENANT_BASE_HEADER, `/s/${slug}`);
    }
    return NextResponse.next({ request: { headers } });
  }

  // On a school host, the tenant comes from the host only.
  if (isTenantPath || url.pathname.startsWith('/platform')) {
    return new NextResponse('Not found', { status: 404 });
  }
  const key = res.kind === 'subdomain' ? res.slug : res.hostname;
  headers.set(TENANT_BASE_HEADER, '');
  const target = url.clone();
  target.pathname = `/s/${key}${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$).*)'],
};
