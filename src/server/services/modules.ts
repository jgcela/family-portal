import { and, eq } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from '../db/client';
import { plans, subscriptions, tenantModules } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { assertCan, AuthorizationError, type AuthzContext } from '../rbac/authorize';
import { getModule, MODULES } from '../modules/registry';
import { activeModules, checkModuleChange, entitledModules } from '../modules/rules';

export { ValidationError } from '../errors';
import { ValidationError } from '../errors';

export async function getModuleState(tenantId: string, db: Db = platformDb()) {
  return withTenant(
    tenantId,
    async (tx) => {
      const rows = await tx.select().from(tenantModules).where(eq(tenantModules.tenantId, tenantId));
      const [sub] = await tx
        .select({ status: subscriptions.status, extra: subscriptions.extraModules, included: plans.includedModules })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(subscriptions.tenantId, tenantId));
      const entitled = entitledModules(
        sub ? { status: sub.status, includedModules: sub.included, extraModules: sub.extra } : null,
      );
      const enabledIds = new Set(rows.filter((r) => r.enabled).map((r) => r.moduleId));
      return {
        rows,
        entitled,
        enabledIds,
        active: activeModules(enabledIds, entitled),
        catalog: MODULES.map((m) => ({
          ...m,
          enabled: enabledIds.has(m.id),
          entitled: entitled.has(m.id),
          row: rows.find((r) => r.moduleId === m.id),
        })),
      };
    },
    db,
  );
}

/** Enables or disables a module for the actor's school. Never deletes module data. */
export async function setModuleEnabled(ctx: AuthzContext, moduleId: string, enable: boolean, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'modules.toggle');
  if (!getModule(moduleId)) throw new ValidationError('Unknown module.');
  const state = await getModuleState(ctx.tenantId, db);
  const result = checkModuleChange({ moduleId, enable, enabledIds: state.enabledIds, entitled: state.entitled });
  if (!result.ok) throw new ValidationError(result.reason);

  await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx
        .insert(tenantModules)
        .values({ tenantId: ctx.tenantId, moduleId, enabled: enable, updatedByUserId: ctx.userId })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.moduleId],
          set: { enabled: enable, updatedAt: new Date(), updatedByUserId: ctx.userId },
        });
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: enable ? 'module.enabled' : 'module.disabled',
        targetType: 'module',
        targetId: moduleId,
      });
    },
    db,
  );
}

export async function configureModule(
  ctx: AuthzContext,
  moduleId: string,
  config: unknown,
  db: Db = platformDb(),
) {
  assertVerifiedContext(ctx);
  assertCan(ctx, 'modules.configure');
  const mod = getModule(moduleId);
  if (!mod) throw new ValidationError('Unknown module.');
  const parsed = mod.configSchema.safeParse(config);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      const updated = await tx
        .update(tenantModules)
        .set({ config: parsed.data, updatedAt: new Date(), updatedByUserId: ctx.userId })
        .where(and(eq(tenantModules.tenantId, ctx.tenantId), eq(tenantModules.moduleId, moduleId)))
        .returning();
      if (updated.length === 0) throw new AuthorizationError('Module not found for this school.');
      await audit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'module.configured',
        targetType: 'module',
        targetId: moduleId,
      });
    },
    db,
  );
}
