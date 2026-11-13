// Stable document link: /d/<slug>. Checks access on every request, then
// redirects to a signed storage URL that expires after a few minutes. The
// storage URL is never shown in the portal or saved anywhere.
import { headers } from 'next/headers';
import { auth } from '@/server/auth/auth';
import { loadAuthzContext } from '@/server/rbac/context';
import { resolveDocumentLink } from '@/server/services/documents';
import { getModuleState } from '@/server/services/modules';
import { getPrivateStorage, StorageNotConfiguredError } from '@/server/storage/storage';
import { findTenantByKey, isServable } from '@/server/tenancy/tenants';

type Ctx = { params: Promise<{ tenant: string; slug: string }> };

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const notFound = () => new Response('Not found', { status: 404, headers: NO_STORE });

// Shown in the browser; everything else downloads.
const INLINE = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)/;

export async function GET(req: Request, { params }: Ctx) {
  const { tenant: key, slug } = await params;
  const tenant = await findTenantByKey(decodeURIComponent(key));
  if (!tenant || !isServable(tenant)) return notFound();
  const url = new URL(req.url);
  const v = url.searchParams.get('v');
  const version = v && /^\d{1,5}$/.test(v) ? Number(v) : undefined;

  const session = await auth().api.getSession({ headers: await headers() });
  const viewer = session ? await loadAuthzContext(tenant.id, session.user.id) : null;
  const modules = await getModuleState(tenant.id);
  const file = await resolveDocumentLink(tenant.id, slug, viewer, {
    version,
    moduleActive: modules.active.some((m) => m.id === 'documents'),
  });
  if (!file) return notFound();

  try {
    const target = await getPrivateStorage().signedGetUrl(file.storageKey, {
      fileName: file.fileName,
      contentType: file.contentType,
      inline: url.searchParams.get('download') !== '1' && INLINE.test(file.contentType),
      expiresIn: 300,
    });
    return new Response(null, { status: 302, headers: { ...NO_STORE, Location: new URL(target, url).toString() } });
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return new Response('File storage is not configured yet.', { status: 503, headers: NO_STORE });
    throw err;
  }
}
