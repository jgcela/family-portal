// Workflow rules: approved templates a school switches on and adjusts.
//
// A rule is data, never code. Its conditions and actions come from the fixed
// vocabulary below and are validated with zod on every save and every run, so
// a broken or tampered row can't do anything outside that vocabulary. For each
// trigger the first enabled rule that matches (lowest sort order) applies;
// with none, the request goes to the inbox unassigned with default timing.
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { memberships, workflows, type Workflow } from '../db/schema';
import { audit } from '../audit/log';
import { can, type AuthzContext } from '../rbac/authorize';
import { ValidationError } from './modules';
import { assertId, assertModules, assertStaff, deny } from './ops-common';

export type Trigger = 'attendance_notice' | 'family_question' | 'office_request';
const ATT_TYPES = ['absent', 'late', 'early_dismissal'] as const;
const ATT_REASONS = ['illness', 'medical_appointment', 'family', 'other'] as const;

export const workflowConfigSchema = z.object({
  match: z
    .object({
      types: z.array(z.enum(ATT_TYPES)).max(3).default([]),
      reasons: z.array(z.enum(ATT_REASONS)).max(4).default([]),
      gradeIds: z.array(z.string().uuid()).max(50).default([]),
      /** Only notices covering at most this many calendar days. */
      maxDays: z.number().int().min(1).max(30).nullable().default(null),
    })
    .default({ types: [], reasons: [], gradeIds: [], maxDays: null }),
  /** route: goes to the inbox for a person to handle. auto_accept: attendance only; recorded as accepted, nobody needs to act. */
  action: z.enum(['route', 'auto_accept']).default('route'),
  assigneeUserId: z.string().min(1).max(64).nullable().default(null),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueInHours: z.number().int().min(1).max(336).default(24),
  escalateAfterHours: z.number().int().min(1).max(336).nullable().default(null),
  escalateToUserId: z.string().min(1).max(64).nullable().default(null),
  /** Shown to the family on their receipt. */
  familyMessage: z.string().trim().max(500).default(''),
});
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

export const DEFAULT_CONFIG: WorkflowConfig = workflowConfigSchema.parse({});

export type Template = {
  key: string;
  name: string;
  trigger: Trigger | null;
  description: string;
  available: boolean;
  config: Partial<WorkflowConfig>;
};

export const TEMPLATES: Template[] = [
  {
    key: 'attendance_route',
    name: 'Attendance notices to the attendance office',
    trigger: 'attendance_notice',
    description: 'Every absence, late arrival or early dismissal goes to one person, due the same day.',
    available: true,
    config: { action: 'route', dueInHours: 8, priority: 'normal', familyMessage: 'Thank you. The office will review your notice today.' },
  },
  {
    key: 'attendance_auto_accept',
    name: 'Accept one-day illness absences automatically',
    trigger: 'attendance_notice',
    description: 'One-day absences for illness are recorded as accepted without anyone acting. They still show in the inbox history and reports.',
    available: true,
    config: { action: 'auto_accept', match: { types: ['absent'], reasons: ['illness'], gradeIds: [], maxDays: 1 }, familyMessage: 'Your notice has been recorded. We hope your child feels better soon.' },
  },
  {
    key: 'question_escalation',
    name: 'Questions the assistant could not answer',
    trigger: 'family_question',
    description: 'When a family sends a question to the office, it gets an owner and a due time.',
    available: true,
    config: { action: 'route', dueInHours: 24 },
  },
  {
    key: 'office_request',
    name: 'General requests from families',
    trigger: 'office_request',
    description: 'Requests from the "Contact the office" form get an owner, a due time and escalation.',
    available: true,
    config: { action: 'route', dueInHours: 48, escalateAfterHours: 72 },
  },
  { key: 'field_trip_permission', name: 'Field trip permission', trigger: null, description: 'Needs the Forms module, which is not built yet.', available: false, config: {} },
  { key: 'handbook_acknowledgement', name: 'Handbook acknowledgement', trigger: null, description: 'Needs the Forms module, which is not built yet.', available: false, config: {} },
  { key: 'volunteer_signup', name: 'Volunteer sign-up', trigger: null, description: 'Needs the Forms module, which is not built yet.', available: false, config: {} },
  { key: 'school_form', name: 'School form', trigger: null, description: 'Needs the Forms module, which is not built yet.', available: false, config: {} },
  { key: 'document_collection', name: 'Document collection', trigger: null, description: 'Needs the Forms module, which is not built yet.', available: false, config: {} },
];

export type Facts = { type?: (typeof ATT_TYPES)[number]; reason?: (typeof ATT_REASONS)[number]; gradeId?: string | null; days?: number };

export function matches(c: WorkflowConfig, f: Facts): boolean {
  const m = c.match;
  if (m.types.length && (!f.type || !m.types.includes(f.type))) return false;
  if (m.reasons.length && (!f.reason || !m.reasons.includes(f.reason))) return false;
  if (m.gradeIds.length && (!f.gradeId || !m.gradeIds.includes(f.gradeId))) return false;
  if (m.maxDays !== null && (f.days === undefined || f.days > m.maxDays)) return false;
  return true;
}

/**
 * The rule that applies to a new request. Rules only run when the school has
 * the Workflows module on; otherwise every request gets the defaults.
 */
export async function decide(tx: Tx, trigger: Trigger, facts: Facts, workflowsActive: boolean): Promise<{ workflow: Workflow | null; config: WorkflowConfig }> {
  if (workflowsActive) {
    const rows = await tx
      .select()
      .from(workflows)
      .where(and(eq(workflows.trigger, trigger), eq(workflows.enabled, true)))
      .orderBy(asc(workflows.sortOrder), asc(workflows.createdAt));
    for (const w of rows) {
      const parsed = workflowConfigSchema.safeParse(w.config);
      if (!parsed.success) continue; // a row that no longer validates is skipped, never half-applied
      const c = parsed.data;
      if (c.action === 'auto_accept' && trigger !== 'attendance_notice') continue;
      if (matches(c, facts)) return { workflow: w, config: c };
    }
  }
  return { workflow: null, config: DEFAULT_CONFIG };
}

/** A staff member who can work this item, or null. */
export async function validAssignee(tx: Tx, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [m] = await tx.select().from(memberships).where(eq(memberships.userId, userId));
  return m && m.kind === 'staff' && m.status === 'active' ? userId : null;
}

// ---------- Management ----------

async function needManage(ctx: AuthzContext) {
  assertStaff(ctx, { write: true });
  if (!can(ctx, 'workflows.manage')) deny('Not allowed: workflows.manage');
  await assertModules(ctx.tenantId, ['workflows']);
}

export async function listWorkflows(ctx: AuthzContext, db: Db = platformDb()) {
  assertStaff(ctx);
  if (!can(ctx, 'workflows.manage')) deny('Not allowed: workflows.manage');
  return withTenant(ctx.tenantId, (tx) => tx.select().from(workflows).orderBy(asc(workflows.trigger), asc(workflows.sortOrder), asc(workflows.createdAt)), db);
}

export async function getWorkflow(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertStaff(ctx);
  if (!can(ctx, 'workflows.manage')) deny('Not allowed: workflows.manage');
  assertId(id, 'Workflow');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [w] = await tx.select().from(workflows).where(eq(workflows.id, id));
      if (!w) throw new ValidationError('Workflow not found.');
      return { ...w, parsed: workflowConfigSchema.parse(w.config) };
    },
    db,
  );
}

export async function createFromTemplate(ctx: AuthzContext, templateKey: string, db: Db = platformDb()) {
  await needManage(ctx);
  const t = TEMPLATES.find((x) => x.key === templateKey);
  if (!t) throw new ValidationError('Template not found.');
  if (!t.available || !t.trigger) throw new ValidationError(`${t.name} is not available yet: ${t.description}`);
  const config = workflowConfigSchema.parse(t.config);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [w] = await tx
        .insert(workflows)
        .values({ tenantId: ctx.tenantId, templateKey: t.key, name: t.name, trigger: t.trigger!, config, enabled: false, createdByUserId: ctx.userId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'workflows.created', targetType: 'workflow', targetId: w!.id, metadata: { template: t.key } });
      return w!;
    },
    db,
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  config: workflowConfigSchema,
});

export async function updateWorkflow(ctx: AuthzContext, id: string, input: unknown, db: Db = platformDb()) {
  await needManage(ctx);
  assertId(id, 'Workflow');
  const d = editSchema.parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const [w] = await tx.select().from(workflows).where(eq(workflows.id, id)).for('update');
      if (!w) throw new ValidationError('Workflow not found.');
      if (d.config.action === 'auto_accept' && w.trigger !== 'attendance_notice') throw new ValidationError('Only attendance notices can be accepted automatically.');
      for (const [k, v] of [['assignee', d.config.assigneeUserId], ['escalation contact', d.config.escalateToUserId]] as const) {
        if (v && !(await validAssignee(tx, v))) throw new ValidationError(`The ${k} must be an active staff member.`);
      }
      if (d.config.escalateAfterHours && !d.config.escalateToUserId) throw new ValidationError('Choose who receives escalations.');
      await tx.update(workflows).set({ ...d, updatedAt: new Date() }).where(eq(workflows.id, id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'workflows.updated', targetType: 'workflow', targetId: id, metadata: { enabled: d.enabled, action: d.config.action } });
    },
    db,
  );
}

export async function deleteWorkflow(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  await needManage(ctx);
  assertId(id, 'Workflow');
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const r = await tx.delete(workflows).where(eq(workflows.id, id)).returning();
      if (!r.length) throw new ValidationError('Workflow not found.');
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'workflows.deleted', targetType: 'workflow', targetId: id });
    },
    db,
  );
}
