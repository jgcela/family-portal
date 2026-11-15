// Writes the plan catalog into the plans table and moves schools off retired plans.
import { eq, inArray } from 'drizzle-orm';
import { platformDb, type Db } from '../db/client';
import { rolePermissions, roles, plans, subscriptions, tenants } from '../db/schema';
import { ROLE_TEMPLATES } from '../rbac/role-templates';
import { PLAN_CATALOG, RETIRED_PLANS } from './catalog';

export async function syncPlans(db: Db = platformDb()) {
  return db.transaction(async (tx) => {
    for (const p of PLAN_CATALOG) {
      const row = {
        name: p.name,
        description: p.description,
        includedModules: p.includedModules,
        storageLimitMb: p.storageLimitMb,
        staffUserLimit: p.staffUserLimit,
        priceCentsPerYear: p.priceCentsPerYear,
        implementationCents: p.implementationCents,
        limits: { ...p.limits },
        isActive: true,
      };
      await tx.insert(plans).values({ id: p.id, ...row }).onConflictDoUpdate({ target: plans.id, set: row });
    }
    let moved = 0;
    for (const [from, to] of Object.entries(RETIRED_PLANS)) {
      const r = await tx.update(subscriptions).set({ planId: to, updatedAt: new Date() }).where(eq(subscriptions.planId, from)).returning({ id: subscriptions.id });
      moved += r.length;
    }
    const retired = Object.keys(RETIRED_PLANS);
    if (retired.length) await tx.update(plans).set({ isActive: false }).where(inArray(plans.id, retired));
    return { plans: PLAN_CATALOG.length, moved };
  });
}

/**
 * Brings every school's built-in roles up to date with the templates: adds
 * built-in roles that did not exist when the school was created and adds new
 * permissions to built-in roles. Never removes anything, never touches custom
 * roles. Runs on each production deploy, after migrations.
 */
export async function syncSystemRoles(db: Db = platformDb()) {
  return db.transaction(async (tx) => {
    const schools = await tx.select({ id: tenants.id }).from(tenants);
    let added = 0;
    for (const t of schools) {
      const existing = await tx.select().from(roles).where(eq(roles.tenantId, t.id));
      for (const tpl of ROLE_TEMPLATES) {
        let role = existing.find((r) => r.key === tpl.key);
        if (role && !role.isSystem) continue; // a custom role took this key; leave it alone
        if (!role) {
          [role] = await tx
            .insert(roles)
            .values({ tenantId: t.id, key: tpl.key, name: tpl.name, description: tpl.description, isSystem: true, isOwnerRole: !!tpl.isOwnerRole })
            .returning();
        }
        if (!tpl.permissions.length) continue;
        const r = await tx
          .insert(rolePermissions)
          .values(tpl.permissions.map((permission) => ({ tenantId: t.id, roleId: role!.id, permission })))
          .onConflictDoNothing()
          .returning();
        added += r.length;
      }
    }
    return { schools: schools.length, permissionsAdded: added };
  });
}
