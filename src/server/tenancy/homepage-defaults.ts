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
