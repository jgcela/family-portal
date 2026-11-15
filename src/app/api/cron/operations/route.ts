// Daily operations check: escalates inbox items whose workflow rule says they
// have been open too long. Staff opening the inbox runs the same check, so
// this only matters on days nobody looks. Protected by CRON_SECRET.
import { timingSafeEqual } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { platformDb } from '@/server/db/client';
import { tenants } from '@/server/db/schema';
import { runEscalations } from '@/server/services/inbox';

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
  const rows = await platformDb().select({ id: tenants.id }).from(tenants).where(inArray(tenants.status, ['active', 'onboarding']));
  let escalated = 0;
  let failed = 0;
  for (const t of rows) {
    try {
      escalated += await runEscalations(t.id);
    } catch (err) {
      console.error('escalation check failed', t.id, err);
      failed++;
    }
  }
  return Response.json({ ok: true, schools: rows.length, escalated, failed });
}
