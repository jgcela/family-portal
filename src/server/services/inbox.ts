// Operations inbox: one queue for everything that needs the office.
//
// Every item has an owner (or is visibly unowned), a status, a due time and a
// full history. Staff see items in the grades their inbox.view grant covers;
// items without a grade need a school-wide grant. Families see only their own
// items and only the history entries marked for them (never internal notes).
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { attendanceNotices, grades, inboxEvents, inboxItems, inboxViews, replyTemplates, students, user, workflows, type InboxItem } from '../db/schema';
import { audit } from '../audit/log';
import { can, type AuthzContext } from '../rbac/authorize';
import { consume, QuotaExceededError } from '../billing/entitlements';
import { ValidationError } from './modules';
import {
  activeModuleIds,
  assertFamily,
  assertId,
  assertStaff,
  canOnGrade,
  deny,
  gradeScope,
  nextInboxNumber,
  type FamilyViewer,
} from './ops-common';
import { childFor } from './directory';
import { decide, DEFAULT_CONFIG, validAssignee, workflowConfigSchema, type Facts, type Trigger, type WorkflowConfig } from './workflows';
import type { Viewer } from '../viewer';

export const OPEN_STATUSES = ['new', 'in_progress', 'waiting'] as const;
export type InboxStatus = 'new' | 'in_progress' | 'waiting' | 'resolved' | 'cancelled';
const HOUR = 3600_000;

// ---------- Creating items ----------

export type NewItem = {
  tenantId: string;
  kind: 'attendance' | 'question' | 'request';
  trigger: Trigger;
  facts: Facts;
  subject: string;
  body: string;
  requesterUserId: string | null;
  requesterMembershipId: string | null;
  /** The child, as resolved by the student directory (see directory.ts). */
  student: { key: string; name: string; studentId: string | null } | null;
  gradeId: string | null;
  familyMessage?: string;
  now?: Date;
};

/**
 * Creates an inbox item inside the caller's transaction and applies the
 * matching workflow rule. A rule that would exceed the school's automation
 * allowance is not applied; the item still arrives with the defaults.
 */
export async function createInboxItem(tx: Tx, n: NewItem): Promise<{ item: InboxItem; config: WorkflowConfig; automated: boolean }> {
  const now = n.now ?? new Date();
  const mods = await activeModuleIds(n.tenantId);
  let { workflow, config } = await decide(tx, n.trigger, { ...n.facts, gradeId: n.gradeId }, mods.has('workflows'));
  if (workflow) {
    try {
      await consume(tx, n.tenantId, 'automationRunsPerMonth', 1, now);
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) throw err;
      workflow = null;
      config = DEFAULT_CONFIG;
    }
  }
  const automated = !!workflow && config.action === 'auto_accept';
  const assignee = automated ? null : await validAssignee(tx, config.assigneeUserId);
  const number = await nextInboxNumber(tx, n.tenantId);
  const [item] = await tx
    .insert(inboxItems)
    .values({
      tenantId: n.tenantId,
      number,
      kind: n.kind,
      status: automated ? 'resolved' : 'new',
      priority: config.priority,
      subject: n.subject.slice(0, 200),
      body: n.body.slice(0, 4000),
      requesterUserId: n.requesterUserId,
      requesterMembershipId: n.requesterMembershipId,
      studentId: n.student?.studentId ?? null,
      studentKey: n.student?.key ?? null,
      studentName: n.student?.name ?? null,
      gradeId: n.gradeId,
      assigneeUserId: assignee,
      workflowId: workflow?.id ?? null,
      dueAt: automated ? null : new Date(now.getTime() + config.dueInHours * HOUR),
      resolvedAt: automated ? now : null,
      automated,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const events: (typeof inboxEvents.$inferInsert)[] = [
    { tenantId: n.tenantId, itemId: item!.id, kind: 'created', actorUserId: n.requesterUserId, actorKind: n.requesterUserId ? 'family' : 'system', body: n.familyMessage || config.familyMessage || 'Received by the school.', visibleToFamily: true, createdAt: now },
  ];
  if (workflow) {
    events.push({
      tenantId: n.tenantId,
      itemId: item!.id,
      kind: 'automation',
      actorUserId: null,
      actorKind: 'system',
      body: automated ? `Accepted automatically by the rule "${workflow.name}".` : `Rule "${workflow.name}" applied${assignee ? '' : ' (no assignee)'}.`,
      toValue: assignee,
      visibleToFamily: false,
      createdAt: now,
    });
  }
  await tx.insert(inboxEvents).values(events);
  return { item: item!, config, automated };
}

// ---------- Staff: reading ----------

export const filterSchema = z.object({
  status: z.enum(['open', 'new', 'in_progress', 'waiting', 'resolved', 'cancelled', 'all']).catch('open'),
  kind: z.enum(['attendance', 'question', 'request', '']).catch(''),
  assignee: z.string().max(64).catch(''),
  gradeId: z.string().uuid().or(z.literal('')).catch(''),
  priority: z.enum(['low', 'normal', 'high', 'urgent', '']).catch(''),
  overdue: z.enum(['1', '']).catch(''),
  q: z.string().max(80).catch(''),
});
export type InboxFilters = z.infer<typeof filterSchema>;

export function parseFilters(raw: Record<string, unknown>): InboxFilters {
  return filterSchema.parse({ status: raw.status ?? 'open', kind: raw.kind ?? '', assignee: raw.assignee ?? '', gradeId: raw.gradeId ?? '', priority: raw.priority ?? '', overdue: raw.overdue ?? '', q: raw.q ?? '' });
}

function scopeCondition(ctx: AuthzContext, permission: string): SQL | undefined {
  const scope = gradeScope(ctx, permission);
  if (scope === 'all') return undefined;
  if (!scope.length) deny(`Not allowed: ${permission}`);
  return inArray(inboxItems.gradeId, scope);
}

const assigneeUser = alias(user, 'assignee_user');
const requesterUser = alias(user, 'requester_user');

export async function listInbox(ctx: AuthzContext, filters: InboxFilters, now = new Date(), db: Db = platformDb()) {
  assertStaff(ctx);
  const scope = scopeCondition(ctx, 'inbox.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const c: (SQL | undefined)[] = [scope];
      if (filters.status === 'open') c.push(inArray(inboxItems.status, [...OPEN_STATUSES]));
      else if (filters.status !== 'all') c.push(eq(inboxItems.status, filters.status));
      if (filters.kind) c.push(eq(inboxItems.kind, filters.kind));
      if (filters.assignee === 'me') c.push(eq(inboxItems.assigneeUserId, ctx.userId));
      else if (filters.assignee === 'none') c.push(isNull(inboxItems.assigneeUserId));
      else if (filters.assignee) c.push(eq(inboxItems.assigneeUserId, filters.assignee));
      if (filters.gradeId) c.push(eq(inboxItems.gradeId, filters.gradeId));
      if (filters.priority) c.push(eq(inboxItems.priority, filters.priority));
      if (filters.overdue) c.push(and(inArray(inboxItems.status, [...OPEN_STATUSES]), lt(inboxItems.dueAt, now)));
      const q = filters.q.trim();
      if (q) {
        const num = /^r?-?(\d{1,9})$/i.exec(q)?.[1];
        const like = `%${q.replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
        c.push(or(ilike(inboxItems.subject, like), ilike(inboxItems.studentName, like), num ? eq(inboxItems.number, Number(num)) : undefined));
      }
      const rows = await tx
        .select({ i: inboxItems, grade: grades.name, assignee: assigneeUser.name, requester: requesterUser.name })
        .from(inboxItems)
        .leftJoin(grades, eq(grades.id, inboxItems.gradeId))
        .leftJoin(assigneeUser, eq(assigneeUser.id, inboxItems.assigneeUserId))
        .leftJoin(requesterUser, eq(requesterUser.id, inboxItems.requesterUserId))
        .where(and(...c))
        .orderBy(
          sql`case ${inboxItems.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
          asc(sql`coalesce(${inboxItems.dueAt}, ${inboxItems.createdAt})`),
        )
        .limit(300);
      return rows.map((r) => ({
        ...r.i,
        student: r.i.studentName,
        grade: r.grade,
        assignee: r.assignee,
        requester: r.requester,
        overdue: !!r.i.dueAt && r.i.dueAt < now && (OPEN_STATUSES as readonly string[]).includes(r.i.status),
      }));
    },
    db,
  );
}

export async function inboxStats(ctx: AuthzContext, now = new Date(), db: Db = platformDb()) {
  assertStaff(ctx);
  const scope = scopeCondition(ctx, 'inbox.view');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const since = new Date(now.getTime() - 30 * 24 * HOUR);
      const [open] = await tx
        .select({
          open: sql<number>`count(*) filter (where ${inArray(inboxItems.status, [...OPEN_STATUSES])})::int`,
          overdue: sql<number>`count(*) filter (where ${inArray(inboxItems.status, [...OPEN_STATUSES])} and ${inboxItems.dueAt} < ${now})::int`,
          mine: sql<number>`count(*) filter (where ${inArray(inboxItems.status, [...OPEN_STATUSES])} and ${inboxItems.assigneeUserId} = ${ctx.userId})::int`,
          unassigned: sql<number>`count(*) filter (where ${inArray(inboxItems.status, [...OPEN_STATUSES])} and ${inboxItems.assigneeUserId} is null)::int`,
        })
        .from(inboxItems)
        .where(scope);
      const [res] = await tx
        .select({
          resolved: sql<number>`count(*)::int`,
          automated: sql<number>`count(*) filter (where ${inboxItems.automated})::int`,
          avgResolveHours: sql<number | null>`avg(extract(epoch from (${inboxItems.resolvedAt} - ${inboxItems.createdAt})) / 3600) filter (where not ${inboxItems.automated})`,
          avgFirstResponseHours: sql<number | null>`avg(extract(epoch from (${inboxItems.firstResponseAt} - ${inboxItems.createdAt})) / 3600)`,
        })
        .from(inboxItems)
        .where(and(scope, eq(inboxItems.status, 'resolved'), gte(inboxItems.resolvedAt, since)));
      return {
        ...open!,
        resolved30d: res!.resolved,
        automated30d: res!.automated,
        avgResolveHours: res!.avgResolveHours === null ? null : Number(res!.avgResolveHours),
        avgFirstResponseHours: res!.avgFirstResponseHours === null ? null : Number(res!.avgFirstResponseHours),
      };
    },
    db,
  );
}

async function loadForStaff(tx: Tx, ctx: AuthzContext, id: string, permission: 'inbox.view' | 'inbox.manage', lock = false) {
  assertId(id, 'Request');
  const q = tx.select().from(inboxItems).where(eq(inboxItems.id, id));
  const [item] = lock ? await q.for('update') : await q;
  if (!item) throw new ValidationError('Request not found.');
  if (!canOnGrade(ctx, permission, item.gradeId)) deny(`Not allowed: ${permission}`);
  return item;
}

export async function getInboxItem(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertStaff(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const item = await loadForStaff(tx, ctx, id, 'inbox.view');
      const events = await tx
        .select({ e: inboxEvents, actor: user.name })
        .from(inboxEvents)
        .leftJoin(user, eq(user.id, inboxEvents.actorUserId))
        .where(eq(inboxEvents.itemId, id))
        .orderBy(asc(inboxEvents.createdAt));
      const [s] = item.studentId ? await tx.select().from(students).where(eq(students.id, item.studentId)) : [];
      const [notice] = item.kind === 'attendance' ? await tx.select().from(attendanceNotices).where(eq(attendanceNotices.inboxItemId, id)) : [];
      const [requester] = item.requesterUserId ? await tx.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, item.requesterUserId)) : [];
      const [assignee] = item.assigneeUserId ? await tx.select({ name: user.name }).from(user).where(eq(user.id, item.assigneeUserId)) : [];
      const [grade] = item.gradeId ? await tx.select({ name: grades.name }).from(grades).where(eq(grades.id, item.gradeId)) : [];
      return {
        item,
        events: events.map((x) => ({ ...x.e, actor: x.actor })),
        student: item.studentName
          ? { id: s?.id ?? null, name: item.studentName, externalId: s?.externalId ?? (item.studentKey?.startsWith('facts:') ? item.studentKey.slice(6) : null) }
          : null,
        notice: notice ?? null,
        requester: requester ?? null,
        assignee: assignee?.name ?? null,
        grade: grade?.name ?? null,
        canManage: !ctx.support && canOnGrade(ctx, 'inbox.manage', item.gradeId),
        canReviewAttendance: !ctx.support && canOnGrade(ctx, 'attendance.review', item.gradeId),
      };
    },
    db,
  );
}

/** Staff who can be assigned items (active staff accounts). */
export async function assignableStaff(ctx: AuthzContext, db: Db = platformDb()) {
  assertStaff(ctx);
  return withTenant(
    ctx.tenantId,
    (tx) =>
      tx.execute<{ id: string; name: string }>(sql`
        SELECT u.id, u.name FROM memberships m JOIN "user" u ON u.id = m.user_id
        WHERE m.kind = 'staff' AND m.status = 'active' ORDER BY u.name`),
    db,
  ).then((r) => r.rows);
}

// ---------- Staff: changing ----------

const updateSchema = z.object({
  status: z.enum(['new', 'in_progress', 'waiting', 'resolved', 'cancelled']).optional(),
  assigneeUserId: z.string().max(64).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

async function applyUpdate(tx: Tx, ctx: AuthzContext, item: InboxItem, d: z.infer<typeof updateSchema>, now: Date) {
  const set: Partial<typeof inboxItems.$inferInsert> = { updatedAt: now };
  const events: (typeof inboxEvents.$inferInsert)[] = [];
  const ev = (kind: 'status' | 'assigned' | 'priority', from: string | null, to: string | null, family: boolean) =>
    events.push({ tenantId: ctx.tenantId, itemId: item.id, kind, actorUserId: ctx.userId, actorKind: 'staff', fromValue: from, toValue: to, visibleToFamily: family, createdAt: now });
  if (d.status && d.status !== item.status) {
    if (item.kind === 'attendance' && (d.status === 'resolved' || d.status === 'cancelled')) {
      throw new ValidationError(`R-${item.number}: accept or decline the attendance notice instead.`);
    }
    set.status = d.status;
    set.resolvedAt = d.status === 'resolved' ? now : null;
    ev('status', item.status, d.status, true);
  }
  if (d.assigneeUserId !== undefined && d.assigneeUserId !== item.assigneeUserId) {
    const to = d.assigneeUserId ? await validAssignee(tx, d.assigneeUserId) : null;
    if (d.assigneeUserId && !to) throw new ValidationError('Choose an active staff member.');
    set.assigneeUserId = to;
    ev('assigned', item.assigneeUserId, to, false);
  }
  if (d.priority && d.priority !== item.priority) {
    set.priority = d.priority;
    ev('priority', item.priority, d.priority, false);
  }
  if (!events.length) return false;
  await tx.update(inboxItems).set(set).where(eq(inboxItems.id, item.id));
  await tx.insert(inboxEvents).values(events);
  return true;
}

export async function updateInboxItem(ctx: AuthzContext, id: string, input: unknown, now = new Date(), db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  const d = updateSchema.parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const item = await loadForStaff(tx, ctx, id, 'inbox.manage', true);
      if (await applyUpdate(tx, ctx, item, d, now)) {
        await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'inbox.updated', targetType: 'inbox_item', targetId: id, metadata: d });
      }
    },
    db,
  );
}

/** Applies the same change to many items; items the user can't manage are skipped and reported. */
export async function bulkUpdate(ctx: AuthzContext, ids: string[], input: unknown, now = new Date(), db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  const d = updateSchema.parse(input);
  const list = [...new Set(ids)].slice(0, 200);
  if (!list.length) throw new ValidationError('Select at least one request.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const out = { changed: 0, skipped: [] as string[] };
      for (const id of list) {
        assertId(id, 'Request');
        const [item] = await tx.select().from(inboxItems).where(eq(inboxItems.id, id)).for('update');
        if (!item || !canOnGrade(ctx, 'inbox.manage', item.gradeId)) {
          out.skipped.push(item ? `R-${item.number}: not allowed` : 'A request was not found');
          continue;
        }
        try {
          if (await applyUpdate(tx, ctx, item, d, now)) out.changed++;
        } catch (err) {
          if (err instanceof ValidationError) out.skipped.push(err.message);
          else throw err;
        }
      }
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'inbox.bulk_updated', metadata: { ...d, count: out.changed } });
      return out;
    },
    db,
  );
}

/** A reply (shown to the family) or an internal note (staff only). */
export async function addComment(ctx: AuthzContext, id: string, input: { body: string; toFamily: boolean; waitForFamily?: boolean }, now = new Date(), db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  const body = String(input.body ?? '').trim();
  if (!body) throw new ValidationError('Write a message first.');
  if (body.length > 4000) throw new ValidationError('Keep the message under 4,000 characters.');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const item = await loadForStaff(tx, ctx, id, 'inbox.manage', true);
      if (input.toFamily && !item.requesterUserId) throw new ValidationError('This request has no family to reply to.');
      await tx.insert(inboxEvents).values({ tenantId: ctx.tenantId, itemId: id, kind: input.toFamily ? 'reply' : 'note', actorUserId: ctx.userId, actorKind: 'staff', body, visibleToFamily: input.toFamily, createdAt: now });
      const set: Partial<typeof inboxItems.$inferInsert> = { updatedAt: now };
      if (input.toFamily && !item.firstResponseAt) set.firstResponseAt = now;
      if (item.status === 'new') set.status = 'in_progress';
      if (input.toFamily && input.waitForFamily && item.kind !== 'attendance') set.status = 'waiting';
      await tx.update(inboxItems).set(set).where(eq(inboxItems.id, id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: input.toFamily ? 'inbox.replied' : 'inbox.noted', targetType: 'inbox_item', targetId: id });
    },
    db,
  );
}

/**
 * Escalates open items whose rule says so and whose time has passed:
 * reassigns to the escalation contact and raises the priority. Runs from the
 * daily cron and whenever staff open the inbox, and never escalates twice.
 */
export async function runEscalations(tenantId: string, now = new Date(), db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const rows = await tx
        .select({ i: inboxItems, w: workflows })
        .from(inboxItems)
        .innerJoin(workflows, eq(workflows.id, inboxItems.workflowId))
        .where(and(inArray(inboxItems.status, [...OPEN_STATUSES]), isNull(inboxItems.escalatedAt), isNotNull(inboxItems.workflowId)))
        .limit(500);
      let n = 0;
      for (const { i, w } of rows) {
        const c = workflowConfigSchema.safeParse(w.config);
        if (!c.success || !c.data.escalateAfterHours) continue;
        if (i.createdAt.getTime() + c.data.escalateAfterHours * HOUR > now.getTime()) continue;
        const to = await validAssignee(tx, c.data.escalateToUserId);
        const priority = i.priority === 'urgent' ? 'urgent' : 'high';
        await tx.update(inboxItems).set({ escalatedAt: now, assigneeUserId: to ?? i.assigneeUserId, priority, updatedAt: now }).where(eq(inboxItems.id, i.id));
        await tx.insert(inboxEvents).values({
          tenantId,
          itemId: i.id,
          kind: 'escalated',
          actorUserId: null,
          actorKind: 'system',
          body: `Open for more than ${c.data.escalateAfterHours} hours: escalated${to ? '' : ' (the escalation contact is no longer active staff)'}.`,
          fromValue: i.assigneeUserId,
          toValue: to,
          visibleToFamily: false,
          createdAt: now,
        });
        n++;
      }
      return n;
    },
    db,
  );
}

// ---------- Reply templates and saved views ----------

export async function listTemplates(ctx: AuthzContext, db: Db = platformDb()) {
  assertStaff(ctx);
  if (gradeScope(ctx, 'inbox.view') !== 'all' && !gradeScope(ctx, 'inbox.view').length) deny('Not allowed: inbox.view');
  return withTenant(ctx.tenantId, (tx) => tx.select().from(replyTemplates).orderBy(asc(replyTemplates.title)), db);
}

const templateSchema = z.object({ title: z.string().trim().min(1, 'Enter a title.').max(80), body: z.string().trim().min(1, 'Enter the text.').max(4000) });

export async function saveTemplate(ctx: AuthzContext, id: string | null, input: unknown, db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  if (!can(ctx, 'inbox.manage')) deny('Not allowed: inbox.manage');
  const d = templateSchema.parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      if (id) {
        assertId(id, 'Template');
        const r = await tx.update(replyTemplates).set({ ...d, updatedAt: new Date() }).where(eq(replyTemplates.id, id)).returning();
        if (!r.length) throw new ValidationError('Template not found.');
      } else {
        await tx.insert(replyTemplates).values({ ...d, tenantId: ctx.tenantId, createdByUserId: ctx.userId });
      }
    },
    db,
  );
}

export async function deleteTemplate(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertStaff(ctx, { write: true });
  if (!can(ctx, 'inbox.manage')) deny('Not allowed: inbox.manage');
  assertId(id, 'Template');
  return withTenant(ctx.tenantId, (tx) => tx.delete(replyTemplates).where(eq(replyTemplates.id, id)), db);
}

export async function listViews(ctx: AuthzContext, db: Db = platformDb()) {
  assertStaff(ctx);
  return withTenant(ctx.tenantId, (tx) => tx.select().from(inboxViews).where(eq(inboxViews.userId, ctx.userId)).orderBy(asc(inboxViews.name)), db);
}

export async function saveView(ctx: AuthzContext, name: string, filters: InboxFilters, db: Db = platformDb()) {
  assertStaff(ctx);
  const n = name.trim().slice(0, 60);
  if (!n) throw new ValidationError('Name the view.');
  const clean = Object.fromEntries(Object.entries(filterSchema.parse(filters)).filter(([, v]) => v !== ''));
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const mine = await tx.select({ id: inboxViews.id }).from(inboxViews).where(eq(inboxViews.userId, ctx.userId));
      if (mine.length >= 20) throw new ValidationError('You can keep up to 20 saved views. Delete one first.');
      await tx.insert(inboxViews).values({ tenantId: ctx.tenantId, userId: ctx.userId, name: n, filters: clean });
    },
    db,
  );
}

export async function deleteView(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertStaff(ctx);
  assertId(id, 'View');
  return withTenant(ctx.tenantId, (tx) => tx.delete(inboxViews).where(and(eq(inboxViews.id, id), eq(inboxViews.userId, ctx.userId))), db);
}

// ---------- Families ----------

const FAMILY_DAILY_LIMIT = 10;

export const familyRequestSchema = z.object({
  kind: z.enum(['question', 'request']),
  subject: z.string().trim().min(3, 'Add a short subject.').max(150),
  body: z.string().trim().min(1, 'Write your message.').max(3000),
  /** A child key from the student directory ("facts:…", "manual:…"); empty for none. */
  studentId: z.string().max(120).optional(),
});

export async function createFamilyRequest(tenantId: string, viewer: Viewer, input: unknown, now = new Date(), db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  const mods = await activeModuleIds(tenantId);
  if (!mods.has('operations_inbox')) throw new ValidationError('The school is not taking requests here yet. Please contact the office.');
  const d = familyRequestSchema.parse(input);
  // Resolve the child before the transaction: it may call the school's SIS.
  const child = d.studentId ? await childFor(tenantId, v, d.studentId, 'view', db) : null;
  if (d.studentId && !child) throw new ValidationError('Choose one of your children.');
  return withTenant(
    tenantId,
    async (tx) => {
      const since = new Date(now.getTime() - 24 * HOUR);
      const [c] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(inboxItems)
        .where(and(eq(inboxItems.requesterUserId, v.userId), gte(inboxItems.createdAt, since), notInArray(inboxItems.kind, ['attendance'])));
      if ((c?.n ?? 0) >= FAMILY_DAILY_LIMIT) throw new ValidationError('You have sent several requests today. Please call the office if it is urgent.');
      const { item } = await createInboxItem(tx, {
        tenantId,
        kind: d.kind,
        trigger: d.kind === 'question' ? 'family_question' : 'office_request',
        facts: {},
        subject: d.subject,
        body: d.body,
        requesterUserId: v.userId,
        requesterMembershipId: v.membershipId,
        student: child ? { key: child.key, name: child.name, studentId: child.studentId } : null,
        gradeId: child?.gradeId ?? null,
        now,
      });
      await audit(tx, { tenantId, actorUserId: v.userId, action: 'inbox.family_created', targetType: 'inbox_item', targetId: item.id, metadata: { kind: d.kind } });
      return item;
    },
    db,
  );
}

export async function myRequests(tenantId: string, viewer: Viewer, db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  return withTenant(
    tenantId,
    async (tx) => {
      const rows = await tx
        .select({ i: inboxItems, n: attendanceNotices })
        .from(inboxItems)
        .leftJoin(attendanceNotices, eq(attendanceNotices.inboxItemId, inboxItems.id))
        .where(eq(inboxItems.requesterUserId, v.userId))
        .orderBy(desc(inboxItems.createdAt))
        .limit(100);
      return rows.map((r) => ({
        id: r.i.id,
        number: r.i.number,
        kind: r.i.kind,
        subject: r.i.subject,
        status: r.i.status,
        noticeStatus: r.n?.status ?? null,
        student: r.i.studentName,
        createdAt: r.i.createdAt,
        updatedAt: r.i.updatedAt,
      }));
    },
    db,
  );
}

export async function myRequest(tenantId: string, viewer: Viewer, id: string, db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  assertId(id, 'Request');
  return withTenant(
    tenantId,
    async (tx) => {
      const [item] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.requesterUserId, v.userId)));
      if (!item) throw new ValidationError('Request not found.');
      const events = await tx
        .select({ kind: inboxEvents.kind, body: inboxEvents.body, toValue: inboxEvents.toValue, actorKind: inboxEvents.actorKind, createdAt: inboxEvents.createdAt })
        .from(inboxEvents)
        .where(and(eq(inboxEvents.itemId, id), eq(inboxEvents.visibleToFamily, true)))
        .orderBy(asc(inboxEvents.createdAt));
      const [notice] = item.kind === 'attendance' ? await tx.select().from(attendanceNotices).where(eq(attendanceNotices.inboxItemId, id)) : [];
      return {
        item: { id: item.id, number: item.number, kind: item.kind, subject: item.subject, body: item.body, status: item.status, createdAt: item.createdAt },
        events,
        student: item.studentName,
        notice: notice
          ? { id: notice.id, type: notice.type, dateFrom: notice.dateFrom, dateTo: notice.dateTo, time: notice.time, reason: notice.reason, comment: notice.comment, status: notice.status, reviewNote: notice.reviewNote }
          : null,
      };
    },
    db,
  );
}

export async function familyReply(tenantId: string, viewer: Viewer, id: string, body: string, now = new Date(), db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  assertId(id, 'Request');
  const text = String(body ?? '').trim();
  if (!text) throw new ValidationError('Write a message first.');
  if (text.length > 3000) throw new ValidationError('Keep the message under 3,000 characters.');
  return withTenant(
    tenantId,
    async (tx) => {
      const [item] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.requesterUserId, v.userId))).for('update');
      if (!item) throw new ValidationError('Request not found.');
      if (!(OPEN_STATUSES as readonly string[]).includes(item.status)) throw new ValidationError('This request is closed. Start a new one if you need more help.');
      await tx.insert(inboxEvents).values({ tenantId, itemId: id, kind: 'reply', actorUserId: v.userId, actorKind: 'family', body: text, visibleToFamily: true, createdAt: now });
      await tx.update(inboxItems).set({ status: item.status === 'waiting' ? 'in_progress' : item.status, updatedAt: now }).where(eq(inboxItems.id, id));
    },
    db,
  );
}

export async function cancelFamilyRequest(tenantId: string, viewer: Viewer, id: string, now = new Date(), db: Db = platformDb()) {
  assertFamily(viewer, tenantId);
  const v: FamilyViewer = viewer;
  assertId(id, 'Request');
  return withTenant(
    tenantId,
    async (tx) => {
      const [item] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.requesterUserId, v.userId))).for('update');
      if (!item) throw new ValidationError('Request not found.');
      if (item.kind === 'attendance') throw new ValidationError('Cancel the attendance notice from its page.');
      if (!(OPEN_STATUSES as readonly string[]).includes(item.status)) throw new ValidationError('This request is already closed.');
      await tx.update(inboxItems).set({ status: 'cancelled', updatedAt: now }).where(eq(inboxItems.id, id));
      await tx.insert(inboxEvents).values({ tenantId, itemId: id, kind: 'status', actorUserId: v.userId, actorKind: 'family', fromValue: item.status, toValue: 'cancelled', visibleToFamily: true, createdAt: now });
    },
    db,
  );
}
