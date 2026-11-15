// Central configuration for the FAMITENLY marketing site.
// Brand, contact, demo destination, prices and feature availability live here
// so they can change without touching components. See marketing/README.md.

export type Availability = 'live' | 'pilot' | 'planned';

export const brand = {
  /** Provisional name. Always spelled exactly like this. */
  name: 'FAMITENLY',
  descriptor: 'School Operations Platform',
  /** Canonical domain, without protocol. Replace before launch. */
  domain: 'famitenly.example',
  /** Sales inbox used for the email fallback and footer. Replace before launch. */
  salesEmail: 'sales@famitenly.example',
  audience: 'independent and Catholic K–8 schools',
  year: 2026,
} as const;

export const siteUrl = `https://${brand.domain}`;

/**
 * Demo request destination.
 * - formEndpoint: a URL that accepts a JSON POST (Formspree, Basin, HubSpot
 *   forms proxy, your own API). Set NEXT_PUBLIC_DEMO_FORM_ENDPOINT at build time.
 *   A confirmation is shown only after it answers 2xx.
 * - bookingUrl: an optional scheduling page (Calendly, HubSpot Meetings, Cal.com).
 * With neither set, the form opens a pre-filled email to brand.salesEmail.
 */
export const demo = {
  formEndpoint: process.env.NEXT_PUBLIC_DEMO_FORM_ENDPOINT || null,
  bookingUrl: process.env.NEXT_PUBLIC_DEMO_BOOKING_URL || null,
  sisOptions: ['FACTS', 'Blackbaud', 'PowerSchool', 'Veracross', 'Other', 'Not sure yet'],
} as const;

/**
 * What is actually available today. The site prints these labels next to
 * features and in the demos, so update them in the PR that ships a feature.
 * Defaults reflect the product repository as of November 2026.
 */
const featureDefs = {
  familyPortal: { label: 'Branded family portal with your theme', status: 'live' },
  schoolCms: { label: 'School pages, announcements and newsletters', status: 'live' },
  calendarImports: { label: 'Calendar, events and calendar imports (ICS and CSV)', status: 'live' },
  documents: { label: 'Documents and handbooks with stable links', status: 'live' },
  resources: { label: 'School resources, volunteer and community pages', status: 'live' },
  quickLinks: { label: 'Quick links (FACTS, lunch, supply lists)', status: 'live' },
  conventionalSearch: { label: 'Search across school content', status: 'planned' },
  adminDashboard: { label: 'School administrators and admin dashboard', status: 'live' },
  rolesPermissions: { label: 'Roles and permissions', status: 'live' },
  basicAnalytics: { label: 'Basic usage analytics', status: 'planned' },
  knowledgeAI: { label: 'School knowledge AI with source links', status: 'planned' },
  aiAdmin: { label: 'AI knowledge base, administration and testing sandbox', status: 'planned' },
  absenceNotices: { label: 'Absence and late-arrival notices', status: 'planned' },
  familyReceipts: { label: 'Family receipts and status updates', status: 'planned' },
  officeInbox: { label: 'Operations inbox for the office', status: 'planned' },
  workflowTemplates: { label: 'Automated workflow templates', status: 'planned' },
  forms: { label: 'Forms, permission slips and acknowledgements', status: 'planned' },
  reminders: { label: 'Automated reminders', status: 'planned' },
  analytics: { label: 'Operations analytics and time saved', status: 'planned' },
  familyAssistant: { label: 'Private, signed-in family assistant', status: 'planned' },
  studentQueries: { label: 'Authorized student-specific answers', status: 'planned' },
  advancedWorkflows: { label: 'Advanced workflow automations', status: 'planned' },
  sisIntegrations: { label: 'SIS connectors, scoped per school', status: 'planned' },
  sisWrite: { label: 'Approved SIS write operations, where the SIS allows them', status: 'planned' },
  syncMonitoring: { label: 'Synchronization monitoring', status: 'planned' },
  advancedAnalytics: { label: 'Advanced operations analytics', status: 'planned' },
  prioritySupport: { label: 'Priority support and advanced configuration', status: 'planned' },
} as const;

export type FeatureId = keyof typeof featureDefs;
export const features: Record<FeatureId, { label: string; status: Availability }> = featureDefs;

export const availabilityLabel: Record<Availability, string> = {
  live: 'Live',
  pilot: 'In pilot',
  planned: 'Planned',
};

export type Plan = {
  id: 'essential' | 'smart' | 'autonomous';
  name: string;
  annual: number;
  implementation: number;
  /** "From" pricing for scoped plans. */
  from?: boolean;
  summary: string;
  includesPrevious?: string;
  features: FeatureId[];
  featured?: string;
  cta: string;
  note?: string;
};

export const currency = 'USD';

/**
 * Preliminary commercial assumptions (November 2026), not validated market
 * prices. Change them here; the app's plans table follows on the next deploy.
 */
export const plans: Plan[] = [
  {
    id: 'essential',
    name: 'Essential',
    annual: 2990,
    implementation: 500,
    summary: 'One branded place for families to find school information.',
    features: [
      'familyPortal',
      'schoolCms',
      'calendarImports',
      'documents',
      'resources',
      'quickLinks',
      'conventionalSearch',
      'adminDashboard',
      'rolesPermissions',
      'basicAnalytics',
    ],
    cta: 'Book a Demo',
  },
  {
    id: 'smart',
    name: 'Smart',
    annual: 6990,
    implementation: 1500,
    summary: 'Source-backed answers, absence notices and forms handled without the front desk.',
    includesPrevious: 'Everything in Essential, plus',
    features: [
      'knowledgeAI',
      'aiAdmin',
      'absenceNotices',
      'familyReceipts',
      'officeInbox',
      'workflowTemplates',
      'forms',
      'reminders',
      'analytics',
    ],
    featured: 'Recommended for schools automating routine office work',
    cta: 'Book a Demo',
    note: 'No SIS write integration is included in Smart.',
  },
  {
    id: 'autonomous',
    name: 'Autonomous',
    annual: 12990,
    implementation: 3500,
    from: true,
    summary: 'A private assistant for each family and workflows connected to your SIS.',
    includesPrevious: 'Everything in Smart, plus',
    features: [
      'familyAssistant',
      'studentQueries',
      'advancedWorkflows',
      'sisIntegrations',
      'sisWrite',
      'syncMonitoring',
      'advancedAnalytics',
      'prioritySupport',
    ],
    cta: 'Discuss Your Integration',
    note:
      'Connector scope, provider fees, service limits and supported write operations are defined per school, subject to what the SIS provider allows and the school authorizes. Setup from $3,500 depending on integration scope.',
  },
];

export const calculatorDefaults: Readonly<{
  tasksPerWeek: number;
  sharePercent: number;
  minutesPerTask: number;
  weeksPerYear: number;
  hourlyCost: number;
}> = {
  tasksPerWeek: 30,
  sharePercent: 100,
  minutesPerTask: 10,
  weeksPerYear: 36,
  hourlyCost: 28,
};

/** Slider and input ranges. `step` is the slider step; typed values may be any number in range. */
export const calculatorLimits = {
  tasksPerWeek: { min: 0, max: 300, step: 1, unit: 'tasks / week' },
  sharePercent: { min: 0, max: 100, step: 1, unit: '%' },
  minutesPerTask: { min: 0, max: 60, step: 1, unit: 'min' },
  weeksPerYear: { min: 1, max: 52, step: 1, unit: 'weeks' },
  hourlyCost: { min: 10, max: 100, step: 1, unit: 'USD / hour' },
} as const;

/**
 * One documentary school-life photograph, used in the closing section.
 * Put a licensed file in /public/photos and fill this in. Leave null until
 * the usage rights are confirmed; the section then shows without a photo.
 * Never use photos of real students without written consent.
 */
export const schoolPhoto: null | {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
  credit: string;
} = null;

/**
 * Testimonials, school logos and measured outcomes. Publish only material
 * supplied and approved in writing. Empty arrays render nothing.
 */
export const proof = {
  testimonials: [] as { quote: string; name: string; role: string; school: string }[],
  schoolLogos: [] as { src: string; alt: string }[],
};

export const nav = [
  { href: '#product', label: 'Product' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#pricing', label: 'Pricing' },
] as const;
