// Fixed-window attempt limits for forms that sit outside Better Auth's own
// limiter (it only covers /api/auth/*): joining a school and accepting an
// invitation both create accounts. Counts live in the same rate_limit table,
// so they hold across Vercel's serverless instances.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { platformDb, type Db } from '../db/client';
import { rateLimit } from '../db/schema';

/** The caller's IP as Vercel reports it (Vercel sets x-forwarded-for itself). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

/**
 * Counts one attempt for `key` and says whether it is still within `max`
 * attempts per `windowSeconds`. One atomic statement, so parallel requests
 * cannot slip past the limit.
 */
export async function allowAttempt(key: string, max: number, windowSeconds: number, now = Date.now(), db: Db = platformDb()): Promise<boolean> {
  const windowStart = now - windowSeconds * 1000;
  const rows = await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${rateLimit.lastRequest} < ${windowStart} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} < ${windowStart} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count });
  return (rows[0]?.count ?? 1) <= max;
}

export const TOO_MANY = 'Too many attempts. Wait a few minutes and try again.';
