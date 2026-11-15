// Daily knowledge refresh for every school whose plan includes the School
// Knowledge AI: picks up new or changed portal content, re-reads files that
// changed, retires removed items and purges questions past retention.
//
// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET". Without
// CRON_SECRET set, the route refuses every call.
import { timingSafeEqual } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { platformDb } from '@/server/db/client';
import { tenants } from '@/server/db/schema';
import { refreshKnowledge } from '@/server/services/knowledge';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response('Not allowed', { status: 401 });
  const started = Date.now();
  const rows = await platformDb().select({ id: tenants.id }).from(tenants).where(inArray(tenants.status, ['active', 'onboarding']));
  const results: { tenantId: string; indexed?: number; waiting?: number; error?: string }[] = [];
  for (const t of rows) {
    if (Date.now() - started > 50_000) break; // leave the rest for tomorrow's run
    try {
      const r = await refreshKnowledge(t.id);
      results.push({ tenantId: t.id, indexed: r.indexed, waiting: r.waiting });
    } catch (err) {
      console.error('knowledge refresh failed', t.id, err);
      results.push({ tenantId: t.id, error: 'failed' });
    }
  }
  return Response.json({ ok: true, schools: results.length, results });
}
