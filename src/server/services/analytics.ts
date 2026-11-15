// Operations analytics: what the portal handled for the school, and an
// estimate of the staff time it saved.
//
// Only counts and durations leave this file: no names, no subjects, no
// question text. Time saved is an estimate from minutes the school sets
// (module config); the portal does not measure phone calls or emails it
// replaced, and the page says so.
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { assumptionsSchema, type Assumptions } from '../modules/analytics-config';
import { platformDb, withTenant, type Db } from '../db/client';
import { aiQuestions, assistantActions, attendanceNotices, inboxItems, tenantModules, tenants } from '../db/schema';
import { can, type AuthzContext } from '../rbac/authorize';
import { assertModules, assertStaff, deny } from './ops-common';
import { configureModule } from './modules';

export const PERIODS = [7, 30, 90, 365] as const;
export type Period = (typeof PERIODS)[number];

export { assumptionsSchema, type Assumptions };

const OPEN = ['new', 'in_progress', 'waiting'] as const;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : null);

function needView(ctx: AuthzContext) {
  assertStaff(ctx);
  if (!can(ctx, 'analytics.view')) deny('Not allowed: analytics.view');
}

export async function getAssumptions(tenantId: string, db: Db = platformDb()): Promise<Assumptions> {
  const [row] = await withTenant(tenantId, (tx) => tx.select({ config: tenantModules.config }).from(tenantModules).where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, 'ops_analytics'))), db);
  const p = assumptionsSchema.safeParse(row?.config ?? {});
  return p.success ? p.data : assumptionsSchema.parse({});
}

/** Saves the school's own minutes and hourly cost. Needs modules.configure (checked by configureModule). */
export async function updateAssumptions(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  const d = assumptionsSchema.parse(input);
  await configureModule(ctx, 'ops_analytics', d, db);
  return d;
}

export async function getOpsAnalytics(ctx: AuthzContext, days: Period = 30, now = new Date(), db: Db = platformDb()) {
  needView(ctx);
  await assertModules(ctx.tenantId, ['ops_analytics']);
  if (!PERIODS.includes(days)) days = 30;
  const since = new Date(now.getTime() - days * 24 * 3600_000);
  const assumptions = await getAssumptions(ctx.tenantId, db);
  const [t] = await db.select({ tz: tenants.timezone }).from(tenants).where(eq(tenants.id, ctx.tenantId));
  const tz = t?.tz ?? 'UTC';

  const data = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const inPeriod = and(gte(inboxItems.createdAt, since), lt(inboxItems.createdAt, now));
      const [inbox] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          attendance: sql<number>`count(*) filter (where ${inboxItems.kind} = 'attendance')::int`,
          questions: sql<number>`count(*) filter (where ${inboxItems.kind} = 'question')::int`,
          requests: sql<number>`count(*) filter (where ${inboxItems.kind} = 'request')::int`,
          automated: sql<number>`count(*) filter (where ${inboxItems.automated})::int`,
          resolved: sql<number>`count(*) filter (where ${inboxItems.status} = 'resolved')::int`,
          responded: sql<number>`count(*) filter (where ${inboxItems.firstResponseAt} is not null and not ${inboxItems.automated})::int`,
          respondedIn24h: sql<number>`count(*) filter (where not ${inboxItems.automated} and ${inboxItems.firstResponseAt} - ${inboxItems.createdAt} <= interval '24 hours')::int`,
          humanItems: sql<number>`count(*) filter (where not ${inboxItems.automated} and ${inboxItems.status} <> 'cancelled')::int`,
          medianFirstResponseHours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${inboxItems.firstResponseAt} - ${inboxItems.createdAt})) / 3600) filter (where ${inboxItems.firstResponseAt} is not null and not ${inboxItems.automated})`,
          medianResolveHours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${inboxItems.resolvedAt} - ${inboxItems.createdAt})) / 3600) filter (where ${inboxItems.resolvedAt} is not null and not ${inboxItems.automated})`,
        })
        .from(inboxItems)
        .where(inPeriod);
      const [now_] = await tx
        .select({
          open: sql<number>`count(*)::int`,
          overdue: sql<number>`count(*) filter (where ${inboxItems.dueAt} < ${now})::int`,
        })
        .from(inboxItems)
        .where(inArray(inboxItems.status, [...OPEN]));
      const weekly = await tx
        .select({
          week: sql<string>`to_char(date_trunc('week', ${inboxItems.createdAt} at time zone ${tz}), 'YYYY-MM-DD')`,
          attendance: sql<number>`count(*) filter (where ${inboxItems.kind} = 'attendance')::int`,
          other: sql<number>`count(*) filter (where ${inboxItems.kind} <> 'attendance')::int`,
        })
        .from(inboxItems)
        .where(inPeriod)
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      const [notices] = await tx
        .select({
          total: sql<number>`count(*) filter (where ${attendanceNotices.status} not in ('draft', 'cancelled'))::int`,
          absent: sql<number>`count(*) filter (where ${attendanceNotices.type} = 'absent' and ${attendanceNotices.status} not in ('draft', 'cancelled'))::int`,
          late: sql<number>`count(*) filter (where ${attendanceNotices.type} = 'late' and ${attendanceNotices.status} not in ('draft', 'cancelled'))::int`,
          early: sql<number>`count(*) filter (where ${attendanceNotices.type} = 'early_dismissal' and ${attendanceNotices.status} not in ('draft', 'cancelled'))::int`,
          cancelled: sql<number>`count(*) filter (where ${attendanceNotices.status} = 'cancelled')::int`,
          enteredInSis: sql<number>`count(*) filter (where ${attendanceNotices.sisRecordedManuallyAt} is not null)::int`,
        })
        .from(attendanceNotices)
        .where(and(gte(attendanceNotices.createdAt, since), lt(attendanceNotices.createdAt, now)));
      const [ai] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          portal: sql<number>`count(*) filter (where ${aiQuestions.channel} = 'portal')::int`,
          assistant: sql<number>`count(*) filter (where ${aiQuestions.channel} = 'family_assistant')::int`,
          answered: sql<number>`count(*) filter (where ${aiQuestions.outcome} = 'answered' and not ${aiQuestions.escalated})::int`,
          noAnswer: sql<number>`count(*) filter (where ${aiQuestions.outcome} in ('no_answer', 'search_only'))::int`,
          escalated: sql<number>`count(*) filter (where ${aiQuestions.escalated})::int`,
          helpful: sql<number>`count(*) filter (where ${aiQuestions.feedback} = 'helpful')::int`,
          notHelpful: sql<number>`count(*) filter (where ${aiQuestions.feedback} = 'not_helpful')::int`,
          costMicroUsd: sql<number>`coalesce(sum(${aiQuestions.costMicroUsd}), 0)::bigint`,
        })
        .from(aiQuestions)
        .where(and(inArray(aiQuestions.channel, ['portal', 'family_assistant']), gte(aiQuestions.createdAt, since), lt(aiQuestions.createdAt, now)));
      const [drafts] = await tx
        .select({
          prepared: sql<number>`count(*)::int`,
          sent: sql<number>`count(*) filter (where ${assistantActions.status} = 'confirmed')::int`,
        })
        .from(assistantActions)
        .where(and(gte(assistantActions.createdAt, since), lt(assistantActions.createdAt, now)));
      return { inbox: inbox!, now: now_!, weekly, notices: notices!, ai: ai!, drafts: drafts! };
    },
    db,
  );

  const a = assumptions;
  const answered = Number(data.ai.answered);
  const minutes = {
    absences: data.notices.total * a.minutesPerAbsenceCall,
    questions: answered * a.minutesPerAnsweredQuestion,
    automation: data.inbox.automated * a.minutesPerAutomatedItem,
  };
  const totalMinutes = minutes.absences + minutes.questions + minutes.automation;
  const aiCostUsd = Number(data.ai.costMicroUsd) / 1_000_000;

  return {
    days,
    since,
    assumptions,
    volume: {
      items: data.inbox.total,
      attendance: data.inbox.attendance,
      questions: data.inbox.questions,
      requests: data.inbox.requests,
      weekly: data.weekly,
    },
    notices: data.notices,
    speed: {
      medianFirstResponseHours: num(data.inbox.medianFirstResponseHours),
      medianResolveHours: num(data.inbox.medianResolveHours),
      respondedWithin24hPct: pct(data.inbox.respondedIn24h, data.inbox.humanItems),
      openNow: data.now.open,
      overdueNow: data.now.overdue,
    },
    automation: {
      automated: data.inbox.automated,
      automatedPct: pct(data.inbox.automated, data.inbox.total),
      resolved: data.inbox.resolved,
    },
    ai: {
      questions: data.ai.total,
      portal: data.ai.portal,
      assistant: data.ai.assistant,
      answered,
      answeredPct: pct(answered, data.ai.total),
      noAnswer: data.ai.noAnswer,
      escalated: data.ai.escalated,
      helpful: data.ai.helpful,
      notHelpful: data.ai.notHelpful,
      costUsd: Math.round(aiCostUsd * 100) / 100,
      costPerAnswerUsd: answered ? Math.round((aiCostUsd / answered) * 1000) / 1000 : null,
      draftsPrepared: data.drafts.prepared,
      draftsSent: data.drafts.sent,
    },
    estimate: {
      minutes,
      hours: Math.round((totalMinutes / 60) * 10) / 10,
      /** Null when the school has not set an hourly cost. */
      staffCostSavedUsd: a.hourlyStaffCost ? Math.round((totalMinutes / 60) * a.hourlyStaffCost) : null,
      aiCostUsd: Math.round(aiCostUsd * 100) / 100,
    },
  };
}

export type OpsAnalytics = Awaited<ReturnType<typeof getOpsAnalytics>>;
