// Default homepage layout (schema-driven blocks). The Homepage Builder (Phase 3)
// edits a copy of this as a draft; the published version is what families see.
import { z } from 'zod';

export const HOMEPAGE_BLOCK_TYPES = [
  'welcome',
  'action-required',
  'this-week',
  'school-updates',
  'your-children',
  'quick-access',
  'upcoming-events',
  'featured-resources',
  'newsletter',
  'volunteer',
  'custom-content',
  'school-message',
] as const;

export const homepageBlockSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(HOMEPAGE_BLOCK_TYPES),
    title: z.string().max(80).optional(),
    enabled: z.boolean(),
    audienceKeys: z.array(z.string().max(64)).max(20).default([]),
    settings: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const homepageSchema = z.array(homepageBlockSchema).max(20);
export type HomepageBlock = z.infer<typeof homepageBlockSchema>;

export const DEFAULT_HOMEPAGE: HomepageBlock[] = [
  { id: 'welcome', type: 'welcome', enabled: true, audienceKeys: [], settings: {} },
  { id: 'action', type: 'action-required', title: 'Action Required', enabled: true, audienceKeys: [], settings: {} },
  { id: 'week', type: 'this-week', title: 'This Week', enabled: true, audienceKeys: [], settings: {} },
  { id: 'updates', type: 'school-updates', title: 'School Updates', enabled: true, audienceKeys: [], settings: {} },
  { id: 'children', type: 'your-children', title: 'Your Children', enabled: false, audienceKeys: [], settings: {} },
  { id: 'quick', type: 'quick-access', title: 'Quick Access', enabled: true, audienceKeys: [], settings: {} },
];

// What the builder shows for each block type. `module` is the module that
// must be active for the block to appear; `rendered` is false until the
// block has a working renderer (those blocks stay hidden from families).
export type BlockInfo = { label: string; description: string; module: string | null; rendered: boolean };

export const BLOCK_INFO: Record<HomepageBlock['type'], BlockInfo> = {
  welcome: { label: 'Welcome banner', description: 'Greeting and headline at the top of the page.', module: null, rendered: true },
  'this-week': { label: 'This week', description: 'Events from the calendar for the next few days.', module: 'calendar', rendered: true },
  'upcoming-events': { label: 'Upcoming events', description: 'The next events on the calendar.', module: 'calendar', rendered: true },
  'school-updates': { label: 'School updates', description: 'Latest published announcements.', module: 'announcements', rendered: true },
  'custom-content': { label: 'Custom message', description: 'A short text written by the school (Markdown).', module: null, rendered: true },
  'action-required': { label: 'Action required', description: 'Forms and tasks families must complete.', module: 'action_required', rendered: false },
  'your-children': { label: 'Your children', description: 'Per-child information for signed-in families.', module: 'student_profiles', rendered: false },
  'quick-access': { label: 'Quick access', description: 'Shortcuts to common links.', module: 'quick_links', rendered: false },
  'featured-resources': { label: 'Featured resources', description: 'Highlighted documents and resources.', module: 'resources', rendered: false },
  newsletter: { label: 'Newsletter', description: 'Latest newsletter issue.', module: 'messenger', rendered: false },
  volunteer: { label: 'Volunteer', description: 'Open volunteer opportunities.', module: 'volunteer', rendered: false },
  'school-message': { label: "Principal's message", description: 'A message from school leadership.', module: null, rendered: false },
};

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Settings each rendered block accepts. Unknown keys are rejected. */
export const BLOCK_SETTINGS: Partial<Record<HomepageBlock['type'], z.ZodType>> = {
  welcome: z.object({}).strict(),
  'this-week': z.object({ days: int(1, 21).optional() }).strict(),
  'upcoming-events': z.object({ withinDays: int(7, 180).optional(), limit: int(1, 20).optional() }).strict(),
  'school-updates': z.object({ limit: int(1, 20).optional() }).strict(),
  'custom-content': z.object({ body: z.string().max(5000).default('') }).strict(),
};

/**
 * Validates a full layout for saving: schema, unique ids, at most one welcome
 * banner, and per-type settings. Returns the cleaned blocks or the problems.
 */
export function validateHomepage(input: unknown): { ok: true; blocks: HomepageBlock[] } | { ok: false; errors: string[] } {
  const parsed = homepageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const errors: string[] = [];
  const ids = new Set<string>();
  const blocks: HomepageBlock[] = [];
  for (const b of parsed.data) {
    if (ids.has(b.id)) errors.push(`Two blocks share the id "${b.id}".`);
    ids.add(b.id);
    const schema = BLOCK_SETTINGS[b.type];
    if (schema) {
      const s = schema.safeParse(b.settings);
      if (!s.success) {
        errors.push(`${BLOCK_INFO[b.type].label}: ${s.error.issues.map((i) => `${i.path.join('.') || 'settings'} ${i.message}`).join('; ')}`);
        continue;
      }
      blocks.push({ ...b, settings: s.data as Record<string, unknown> });
    } else {
      // Not editable yet: keep whatever was there, but bounded.
      if (JSON.stringify(b.settings).length > 2000) errors.push(`${BLOCK_INFO[b.type].label}: settings are too large.`);
      blocks.push(b);
    }
  }
  if (parsed.data.filter((b) => b.type === 'welcome').length > 1) errors.push('Only one welcome banner is allowed.');
  return errors.length ? { ok: false, errors } : { ok: true, blocks };
}
