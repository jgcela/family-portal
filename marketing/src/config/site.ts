// Central configuration for the FAMITENLY marketing site.
// Brand, contact, demo destination, prices and feature availability live here
// so they can change without touching components. See marketing/README.md.

export type Availability = 'live' | 'pilot' | 'planned';

export const brand = {
  /** Provisional name. Always spelled exactly like this. */
  name: 'FAMITENLY',
  descriptor: 'School Operations Platform',
  /** Public domain shown in texts, without protocol. Not connected yet. */
  domain: 'famitenly.com',
  /** Sales inbox used for the email fallback and footer. Replace before launch. */
  salesEmail: 'sales@famitenly.example',
  audience: 'independent and Catholic K–8 schools',
  year: 2026,
} as const;

/**
 * Address used for canonical links, the sitemap and social previews. It stays
 * on the Vercel address until famitenly.com is connected; then set
 * NEXT_PUBLIC_SITE_URL=https://famitenly.com in Vercel and redeploy.
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://family-portal-mkt.vercel.app').replace(/\/+$/, '');

/**
 * Who runs the site, for the privacy policy, terms and footer. Fill these in
 * before launch: a real legal name and a real postal address. Until then the
 * footer shows no address and the legal pages name the brand only.
 */
export const legal = {
  /** Registered company name, e.g. "Famitenly LLC". */
  entity: 'Famitenly, LLC' as string | null,
  /** Postal address shown in the footer and legal pages, one line per entry. */
  address: ['6286 S Sycamore St', 'Littleton, CO 80120'] as string[],
  /** US state whose law governs the terms, e.g. "Colorado". */
  governingState: 'Colorado' as string | null,
  /** Inbox for privacy requests. Defaults to the sales inbox. */
  privacyEmail: null as string | null,
  /** Date shown as "Last updated" on both legal pages (YYYY-MM-DD). */
  updated: '2026-11-15',
};

export const legalName = () => legal.entity ?? brand.name;
export const privacyEmail = () => legal.privacyEmail ?? brand.salesEmail;

/**
 * Cookieless analytics. Set one at build time; with none set, no analytics
 * script loads. Neither option sets cookies, so the site needs no cookie banner.
 * - NEXT_PUBLIC_CF_ANALYTICS_TOKEN: Cloudflare Web Analytics site token (free).
 * - NEXT_PUBLIC_PLAUSIBLE_DOMAIN: the domain as registered in Plausible (paid).
 */
export const analytics = {
  cloudflareToken: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN || null,
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || null,
} as const;

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
  familyPortal: { label: 'Branded family portal', status: 'live' },
  adminDashboard: { label: 'School admin dashboard', status: 'live' },
  calendarImports: { label: 'Calendar imports (ICS and CSV)', status: 'live' },
  documents: { label: 'Documents and handbooks with stable links', status: 'live' },
  rolesPermissions: { label: 'Roles and permissions', status: 'live' },
  absenceNotices: { label: 'Absence and late-arrival notices', status: 'planned' },
  familyReceipts: { label: 'Family receipts', status: 'planned' },
  officeInbox: { label: 'Office inbox', status: 'planned' },
  knowledgeAI: { label: 'School knowledge AI with source links', status: 'planned' },
  forms: { label: 'Forms and permission slips', status: 'planned' },
  reminders: { label: 'Automated reminders', status: 'planned' },
  analytics: { label: 'Operations analytics', status: 'planned' },
  familyAssistant: { label: 'Authenticated family assistant', status: 'planned' },
  studentQueries: { label: 'Authorized student-specific queries', status: 'planned' },
  advancedWorkflows: { label: 'Advanced workflows', status: 'planned' },
  sisIntegrations: { label: 'Supported SIS integrations, scoped per school', status: 'planned' },
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

export const plans: Plan[] = [
  {
    id: 'essential',
    name: 'Essential',
    annual: 4999,
    implementation: 1000,
    summary: 'One portal for families and one inbox for the office.',
    features: [
      'familyPortal',
      'adminDashboard',
      'calendarImports',
      'documents',
      'rolesPermissions',
      'absenceNotices',
      'familyReceipts',
      'officeInbox',
    ],
    cta: 'Book a Demo',
  },
  {
    id: 'smart',
    name: 'Smart',
    annual: 8999,
    implementation: 2000,
    summary: 'Routine questions and forms handled without the front desk.',
    includesPrevious: 'Everything in Essential, plus',
    features: ['knowledgeAI', 'forms', 'reminders', 'analytics'],
    featured: 'Recommended',
    cta: 'Book a Demo',
  },
  {
    id: 'autonomous',
    name: 'Autonomous',
    annual: 14999,
    implementation: 4000,
    from: true,
    summary: 'Student-specific answers and workflows connected to your SIS.',
    includesPrevious: 'Everything in Smart, plus',
    features: ['familyAssistant', 'studentQueries', 'advancedWorkflows', 'sisIntegrations'],
    cta: 'Discuss Your Integration',
    note:
      'SIS integrations are scoped per school, subject to provider capabilities and school authorization. Any SIS vendor or API fees are quoted separately.',
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

// Links start with "/" so they also work from the legal and thank-you pages.
export const nav = [
  { href: '/#product', label: 'Product' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/#pricing', label: 'Pricing' },
] as const;
