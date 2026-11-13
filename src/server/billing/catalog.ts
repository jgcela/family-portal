// Subscription plans. The marketing site (marketing/src/config/site.ts) is the
// single source for plan names, prices and what each plan promises; this file
// only maps those promises to the app's modules and adds platform limits.
// Change prices or plan features there, then deploy: the production build
// syncs the plans table (scripts/sync-plans.ts).
import { plans as marketingPlans, type FeatureId, type Plan as MarketingPlan } from '../../../marketing/src/config/site';

/**
 * Which app modules each marketing feature corresponds to. An empty list means
 * the feature has no module in the app yet: nothing is switched on for it.
 */
export const FEATURE_MODULES: Record<FeatureId, string[]> = {
  familyPortal: ['home', 'announcements', 'pages', 'resources', 'quick_links', 'community', 'directory', 'volunteer', 'messenger', 'family_accounts'],
  adminDashboard: [],
  calendarImports: ['calendar'],
  documents: ['documents'],
  rolesPermissions: [],
  absenceNotices: [],
  familyReceipts: [],
  officeInbox: [],
  knowledgeAI: ['search', 'ai_search'],
  forms: ['forms'],
  reminders: ['action_required', 'notifications'],
  analytics: [],
  familyAssistant: [],
  studentQueries: ['student_profiles'],
  advancedWorkflows: [],
  sisIntegrations: ['facts_integration'],
};

/** Platform limits per plan. The marketing site does not promise these; the platform owner sets them here. */
const LIMITS: Record<MarketingPlan['id'], { storageLimitMb: number; staffUserLimit: number | null }> = {
  essential: { storageLimitMb: 10 * 1024, staffUserLimit: null },
  smart: { storageLimitMb: 25 * 1024, staffUserLimit: null },
  autonomous: { storageLimitMb: 100 * 1024, staffUserLimit: null },
};

/** Plans retired when the catalog moved to the marketing names, and where their schools go. */
export const RETIRED_PLANS: Record<string, MarketingPlan['id']> = { essentials: 'essential', complete: 'autonomous' };

export type CatalogPlan = {
  id: MarketingPlan['id'];
  name: string;
  description: string;
  priceCentsPerYear: number;
  implementationCents: number;
  priceIsFrom: boolean;
  includedModules: string[];
  features: FeatureId[];
  storageLimitMb: number;
  staffUserLimit: number | null;
};

/** Each plan includes everything in the plans before it (as the marketing page says). */
export const PLAN_CATALOG: CatalogPlan[] = (() => {
  const out: CatalogPlan[] = [];
  let features: FeatureId[] = [];
  for (const p of marketingPlans) {
    features = p.includesPrevious ? [...features, ...p.features] : [...p.features];
    const modules = [...new Set(features.flatMap((f) => FEATURE_MODULES[f]))];
    out.push({
      id: p.id,
      name: p.name,
      description: p.summary,
      priceCentsPerYear: Math.round(p.annual * 100),
      implementationCents: Math.round(p.implementation * 100),
      priceIsFrom: !!p.from,
      includedModules: modules,
      features: [...features],
      ...LIMITS[p.id],
    });
  }
  return out;
})();

export const catalogPlan = (id: string) => PLAN_CATALOG.find((p) => p.id === id);
