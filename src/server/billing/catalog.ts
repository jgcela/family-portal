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
  familyPortal: ['home', 'family_accounts'],
  schoolCms: ['announcements', 'pages', 'messenger'],
  calendarImports: ['calendar'],
  documents: ['documents'],
  resources: ['resources', 'community', 'directory', 'volunteer'],
  quickLinks: ['quick_links'],
  conventionalSearch: ['search'],
  adminDashboard: [],
  rolesPermissions: [],
  basicAnalytics: [],
  knowledgeAI: ['knowledge_ai'],
  aiAdmin: [],
  absenceNotices: ['attendance_notices'],
  familyReceipts: [],
  officeInbox: ['operations_inbox'],
  workflowTemplates: ['workflows'],
  forms: ['forms', 'action_required'],
  reminders: ['notifications'],
  analytics: ['ops_analytics'],
  familyAssistant: ['family_assistant'],
  studentQueries: ['student_profiles'],
  advancedWorkflows: [],
  sisIntegrations: ['sis_connectors'],
  sisWrite: [],
  syncMonitoring: [],
  advancedAnalytics: [],
  prioritySupport: [],
};

/**
 * Usage limits per plan (entitlements). The marketing site does not promise
 * these numbers; the platform owner sets them here, and a school can get its
 * own values from the Super Admin (subscriptions.limit_overrides).
 * null = no limit. 0 = not included.
 */
export type PlanLimits = {
  storageMb: number;
  staffUsers: number | null;
  aiQuestionsPerMonth: number;
  automationRunsPerMonth: number;
  integrations: number;
  supportLevel: 'standard' | 'priority';
};

export const LIMIT_KEYS = ['storageMb', 'staffUsers', 'aiQuestionsPerMonth', 'automationRunsPerMonth', 'integrations'] as const;

const LIMITS: Record<MarketingPlan['id'], PlanLimits> = {
  essential: { storageMb: 10 * 1024, staffUsers: null, aiQuestionsPerMonth: 0, automationRunsPerMonth: 0, integrations: 0, supportLevel: 'standard' },
  smart: { storageMb: 25 * 1024, staffUsers: null, aiQuestionsPerMonth: 3000, automationRunsPerMonth: 5000, integrations: 0, supportLevel: 'standard' },
  autonomous: { storageMb: 100 * 1024, staffUsers: null, aiQuestionsPerMonth: 10000, automationRunsPerMonth: 25000, integrations: 2, supportLevel: 'priority' },
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
  limits: PlanLimits;
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
      storageLimitMb: LIMITS[p.id].storageMb,
      staffUserLimit: LIMITS[p.id].staffUsers,
      limits: LIMITS[p.id],
    });
  }
  return out;
})();

export const catalogPlan = (id: string) => PLAN_CATALOG.find((p) => p.id === id);
