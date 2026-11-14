// The HTML of one newsletter issue, for the frame on /messenger/<id>.
// Checks access on every request. The HTML was sanitized when it was saved;
// this response also forbids scripts, forms and plugins with its own CSP, so
// the email's styles stay inside the frame and nothing in it can run.
import { headers } from 'next/headers';
import { auth } from '@/server/auth/auth';
import { loadViewer } from '@/server/viewer';
import { getPublicIssue } from '@/server/services/messenger';
import { getModuleState } from '@/server/services/modules';
import { findTenantByKey, isServable } from '@/server/tenancy/tenants';

type Ctx = { params: Promise<{ tenant: string; id: string }> };

const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src https: data:',
  'font-src https: data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

// Our own rules, added in front of the email: emails are built for a fixed
// width (often 600–640 px), so let them shrink to the frame on phones.
const FIT = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
html,body{margin:0;padding:0}
img{max-width:100vw !important;height:auto !important}
table{max-width:100vw !important}
td,th{word-break:break-word}
@media (max-width:600px){
  img{width:auto !important}
  td[width],td[style*="width:"]{display:block !important;width:auto !important;padding-left:8px !important;padding-right:8px !important}
}
</style>`;

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(_req: Request, { params }: Ctx) {
  const { tenant: key, id } = await params;
  const tenant = await findTenantByKey(decodeURIComponent(key));
  if (!tenant || !isServable(tenant)) return notFound();
  const modules = await getModuleState(tenant.id);
  if (!modules.active.some((m) => m.id === 'messenger')) return notFound();
  const session = await auth().api.getSession({ headers: await headers() });
  const viewer = await loadViewer(tenant.id, session?.user.id);
  const issue = await getPublicIssue(tenant.id, id, viewer);
  if (!issue) return notFound();
  return new Response(FIT + issue.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
