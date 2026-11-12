// Pure rules for enabling/disabling modules and for subscription entitlements.
import { getModule, MODULES, type ModuleDefinition } from './registry';

export type SubscriptionLike = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'comped';
  includedModules: string[];
  extraModules: string[];
};

export function entitledModules(sub: SubscriptionLike | null, registry: ModuleDefinition[] = MODULES): Set<string> {
  const required = registry.filter((m) => m.required).map((m) => m.id);
  if (!sub || sub.status === 'canceled') return new Set(required);
  return new Set([...required, ...sub.includedModules, ...sub.extraModules]);
}

export type ModuleChangeResult = { ok: true } | { ok: false; reason: string };

export function checkModuleChange(input: {
  moduleId: string;
  enable: boolean;
  enabledIds: Set<string>;
  entitled: Set<string>;
  registry?: ModuleDefinition[];
}): ModuleChangeResult {
  const registry = input.registry ?? MODULES;
  const mod = input.registry ? registry.find((m) => m.id === input.moduleId) : getModule(input.moduleId);
  if (!mod) return { ok: false, reason: 'Unknown module.' };

  if (input.enable) {
    if (!mod.implemented) return { ok: false, reason: `${mod.name} is not available yet.` };
    if (!input.entitled.has(mod.id)) return { ok: false, reason: `${mod.name} is not included in your plan.` };
    const missing = mod.dependencies.filter((d) => !input.enabledIds.has(d));
    if (missing.length > 0) {
      const names = missing.map((d) => registry.find((m) => m.id === d)?.name ?? d);
      return { ok: false, reason: `Enable ${names.join(', ')} first.` };
    }
    return { ok: true };
  }

  if (mod.required) return { ok: false, reason: `${mod.name} cannot be disabled.` };
  const dependents = registry.filter((m) => input.enabledIds.has(m.id) && m.dependencies.includes(mod.id));
  if (dependents.length > 0) {
    return { ok: false, reason: `Disable ${dependents.map((m) => m.name).join(', ')} first; it depends on ${mod.name}.` };
  }
  return { ok: true };
}

/** Modules effectively active for a tenant: enabled, implemented and entitled. */
export function activeModules(enabledIds: Set<string>, entitled: Set<string>, registry: ModuleDefinition[] = MODULES) {
  return registry.filter((m) => (m.required || enabledIds.has(m.id)) && m.implemented && entitled.has(m.id));
}
