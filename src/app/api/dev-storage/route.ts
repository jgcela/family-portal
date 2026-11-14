// Development-only file server for LocalStorage (no R2 credentials).
// Links are HMAC-signed and expire, like R2 signed URLs. Disabled in production.
import { contentDisposition, getPrivateStorage, LocalStorage } from '@/server/storage/storage';

function local(): LocalStorage | null {
  if (process.env.NODE_ENV === 'production') return null;
  const storage = getPrivateStorage();
  return storage instanceof LocalStorage ? storage : null;
}

export async function GET(req: Request) {
  const storage = local();
  if (!storage) return new Response('Not found', { status: 404 });
  const ok = storage.verify(new URL(req.url).searchParams);
  if (!ok) return new Response('Link expired or invalid', { status: 403 });
  try {
    const body = await storage.read(ok.key);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': ok.type,
        'Content-Disposition': contentDisposition(ok.name, ok.inline),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/** Direct uploads, standing in for R2's signed PUT URLs. */
export async function PUT(req: Request) {
  const storage = local();
  if (!storage) return new Response('Not found', { status: 404 });
  const key = storage.verifyPut(new URL(req.url).searchParams);
  if (!key) return new Response('Link expired or invalid', { status: 403 });
  const body = new Uint8Array(await req.arrayBuffer());
  await storage.put(key, body);
  return new Response(null, { status: 200 });
}
