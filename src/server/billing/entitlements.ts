// Subscription entitlements: what a school's plan allows and how much it has used.
// Limits come from the plan (plans.limits) with per-school overrides
// (subscriptions.limit_overrides). Usage is counted per calendar month (UTC).
// Nothing here charges money: reaching a limit blocks the metered action and
// the school sees a warning before that (WARN_AT).
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { plans, subscriptions, usageCounters } from '../db/schema';
import type { PlanLimits } from './catalog';

export type Metric = 'aiQuestionsPerMonth' | 'automationRunsPerMonth';
export const WARN_AT = 0.8;

const DEFAULTS: PlanLimits = {
  storageMb: 0,
  staffUsers: null,
  aiQuestionsPerMonth: 0,
  automationRunsPerMonth: 0,
  integrations: 0,
  supportLevel: 'standard',
};

export function period(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

/** Merges plan limits and overrides; unknown keys and wrong types are ignored. */
export function mergeLimits(planLimits: Record<string, unknown>, overrides: Record<string, unknown>, storageMb: number, staffUsers: number | null): PlanLimits {
  const out: PlanLimits = { ...DEFAULTS, storageMb, staffUsers };
  for (const src of [planLimits, overrides]) {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (k === 'supportLevel') {
        if (v === 'standard' || v === 'priority') out.supportLevel = v;
      } else if (k in DEFAULTS && (v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0))) {
        (out as Record<string, unknown>)[k] = v;
      }
    }
  }
  return out;
}

/** The school's effective limits. A canceled or missing subscription has no metered allowance. */
export async function limitsFor(tx: Tx, tenantId: string): Promise<PlanLimits> {
  const [row] = await tx
    .select({ status: subscriptions.status, overrides: subscriptions.limitOverrides, limits: plans.limits, storageMb: plans.storageLimitMb, staff: plans.staffUserLimit })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantId));
  if (!row || row.status === 'canceled') return { ...DEFAULTS };
  return mergeLimits(row.limits, row.overrides, row.storageMb, row.staff);
}

export type QuotaStatus = { metric: Metric; used: number; limit: number | null; remaining: number | null; warn: boolean; blocked: boolean };

export function quotaStatus(metric: Metric, used: number, limit: number | null): QuotaStatus {
  if (limit === null) return { metric, used, limit, remaining: null, warn: false, blocked: false };
  return { metric, used, limit, remaining: Math.max(0, limit - used), warn: limit > 0 && used >= limit * WARN_AT, blocked: used >= limit };
}

export async function usageFor(tx: Tx, tenantId: string, metric: Metric, now = new Date()): Promise<QuotaStatus> {
  const limits = await limitsFor(tx, tenantId);
  const [row] = await tx
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.metric, metric), eq(usageCounters.period, period(now))));
  return quotaStatus(metric, row?.count ?? 0, limits[metric] as number | null);
}

/**
 * Platform safety cap for metrics a plan leaves unlimited: stops runaway use
 * (a bug, a script, abuse) from running up model costs. It is not a plan
 * limit and is not shown to schools; set AI_MONTHLY_SAFETY_CAP to change it,
 * or give one school a higher explicit limit from the Super Admin.
 */
export function safetyCap(metric: Metric): number {
  if (metric !== 'aiQuestionsPerMonth') return 2_000_000_000;
  const n = Number(process.env.AI_MONTHLY_SAFETY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50_000;
}

export class QuotaExceededError extends Error {
  readonly status = 429;
  constructor(readonly quota: QuotaStatus) {
    super(
      quota.limit === 0
        ? 'This feature is not included in the school\'s plan.'
        : quota.limit === null
          ? 'This feature is paused for the school this month. Please contact the school office.'
          : `The school has used its ${quota.limit} included ${quota.metric === 'aiQuestionsPerMonth' ? 'AI questions' : 'automation runs'} this month.`,
    );
    this.name = 'QuotaExceededError';
  }
}

/**
 * Counts `amount` units if they fit in the limit, atomically. Two requests
 * racing for the last unit cannot both pass: the conditional upsert only
 * succeeds when count + amount stays within the limit.
 */
export async function consume(tx: Tx, tenantId: string, metric: Metric, amount = 1, now = new Date()): Promise<QuotaStatus> {
  const limits = await limitsFor(tx, tenantId);
  const limit = limits[metric] as number | null;
  const p = period(now);
  const cap = limit ?? safetyCap(metric);
  const rows = await tx.execute<{ count: number }>(sql`
    INSERT INTO usage_counters (tenant_id, metric, period, count, updated_at)
    SELECT ${tenantId}::uuid, ${metric}, ${p}, ${amount}, now() WHERE ${amount} <= ${cap}
    ON CONFLICT (tenant_id, metric, period)
    DO UPDATE SET count = usage_counters.count + ${amount}, updated_at = now()
    WHERE usage_counters.count + ${amount} <= ${cap}
    RETURNING count`);
  const count = rows.rows[0]?.count;
  if (count === undefined) {
    const current = await usageFor(tx, tenantId, metric, now);
    throw new QuotaExceededError(current);
  }
  return quotaStatus(metric, count, limit);
}
