// Module registry: the stable contract for every portal module.
// Modules are prebuilt and activated per school; there is no runtime plugin
// loading. `implemented` is the honest status: a module can only be enabled
// once its code actually ships. Flip it in the PR that delivers the module.
import { z } from 'zod';

export type ModuleWidget = { id: string; name: string; description: string };
export type NavContribution = { label: string; path: string; area: 'primary' | 'secondary' | 'family' };

export type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'school-life' | 'community' | 'family' | 'integration';
  /** core = part of the initial product; future = on the roadmap. */
  stage: 'core' | 'future';
  /** True only when the module's admin and portal code exist in this build. */
  implemented: boolean;
  /** Cannot be disabled (e.g. Home). */
  required?: boolean;
  configSchema: z.ZodType<Record<string, unknown>>;
  /** Permissions that administer this module (shown in the permissions matrix). */
  permissions: string[];
  dependencies: string[];
  nav?: NavContribution;
  widgets: ModuleWidget[];
  /** Tables holding this module's data. Disabling never deletes them. */
  dataTables: string[];
  /** Plain-language note shown to admins before disabling. */
  onDisable: string;
};

const empty = z.object({}).strict();
const KEEP = 'Content is kept and hidden from families. Re-enable to show it again.';

export const MODULES: ModuleDefinition[] = [
  {
    id: 'home',
    name: 'Home',
    description: 'The family homepage built from configurable sections.',
    category: 'core',
    stage: 'core',
    implemented: true,
    required: true,
    configSchema: z.object({ greeting: z.string().max(120).optional() }).strict(),
    permissions: ['homepage.edit', 'homepage.publish'],
    dependencies: [],
    nav: { label: 'Home', path: '/', area: 'primary' },
    widgets: [],
    dataTables: ['homepage_versions'],
    onDisable: 'Home cannot be disabled.',
  },
  {
    id: 'calendar',
    name: 'Calendar & Events',
    description: 'School calendars, events, imports (ICS/CSV) and Add to Calendar.',
    category: 'school-life',
    stage: 'core',
    implemented: true,
    configSchema: z
      .object({
        defaultView: z.enum(['month', 'week', 'agenda']).default('month'),
        showPastEvents: z.boolean().default(false),
      })
      .strict(),
    permissions: ['events.view', 'events.create', 'events.edit', 'events.publish', 'events.import', 'calendars.manage'],
    dependencies: [],
    nav: { label: 'Calendar', path: '/calendar', area: 'primary' },
    widgets: [
      { id: 'this-week', name: 'This Week', description: 'Events in the next 7 days.' },
      { id: 'upcoming-events', name: 'Upcoming Events', description: 'Next events by audience.' },
    ],
    dataTables: ['calendars', 'events', 'calendar_imports'],
    onDisable: KEEP,
  },
  {
    id: 'announcements',
    name: 'Announcements',
    description: 'School updates, including urgent announcements.',
    category: 'core',
    stage: 'core',
    implemented: true,
    configSchema: empty,
    permissions: ['announcements.create', 'announcements.publish', 'announcements.approve'],
    dependencies: [],
    nav: { label: 'Updates', path: '/updates', area: 'primary' },
    widgets: [{ id: 'school-updates', name: 'School Updates', description: 'Latest published announcements.' }],
    dataTables: ['announcements'],
    onDisable: KEEP,
  },
  {
    id: 'messenger',
    name: 'Messenger / Newsletter',
    description: 'Weekly newsletter archive with search.',
    category: 'core',
    stage: 'core',
    implemented: false,
    configSchema: z.object({ subscribeEmail: z.string().email().optional() }).strict(),
    permissions: ['announcements.create', 'announcements.publish'],
    dependencies: ['announcements'],
    nav: { label: 'School Messenger', path: '/messenger', area: 'secondary' },
    widgets: [{ id: 'newsletter', name: 'Newsletter', description: 'Latest issue.' }],
    dataTables: ['announcements'],
    onDisable: KEEP,
  },
  {
    id: 'documents',
    name: 'Documents',
    description: 'Uploaded files with versions, stable links and private delivery.',
    category: 'core',
    stage: 'core',
    implemented: true,
    configSchema: z.object({ maxUploadMb: z.number().int().min(1).max(50).default(25) }).strict(),
    permissions: ['documents.upload', 'documents.publish', 'documents.delete'],
    dependencies: [],
    nav: { label: 'Documents', path: '/documents', area: 'primary' },
    dataTables: ['documents', 'document_versions', 'media_assets'],
    widgets: [],
    onDisable: KEEP,
  },
  {
    id: 'resources',
    name: 'Resources',
    description: 'Organized categories of documents and links for families.',
    category: 'core',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: ['resources.create', 'resources.publish'],
    dependencies: ['documents'],
    nav: { label: 'Resources', path: '/resources', area: 'primary' },
    widgets: [{ id: 'featured-resources', name: 'Featured Resources', description: 'Pinned resources.' }],
    dataTables: ['resources'],
    onDisable: KEEP,
  },
  {
    id: 'quick_links',
    name: 'Quick Links',
    description: 'Shortcuts such as FACTS, lunch menu or supply list.',
    category: 'core',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: ['navigation.manage'],
    dependencies: [],
    widgets: [{ id: 'quick-access', name: 'Quick Access', description: 'Shortcut buttons.' }],
    dataTables: ['quick_links'],
    onDisable: KEEP,
  },
  {
    id: 'action_required',
    name: 'Action Required',
    description: 'Deadlines and tasks families must complete.',
    category: 'school-life',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: ['action_items.create', 'action_items.publish'],
    dependencies: [],
    widgets: [{ id: 'action-required', name: 'Action Required', description: 'Open deadlines.' }],
    dataTables: ['action_items'],
    onDisable: KEEP,
  },
  {
    id: 'pages',
    name: 'School Pages',
    description: 'Editable pages such as the handbook or supply list.',
    category: 'core',
    stage: 'core',
    implemented: true,
    configSchema: empty,
    permissions: ['pages.create', 'pages.publish'],
    dependencies: [],
    nav: { label: 'School info', path: '/p', area: 'primary' },
    widgets: [],
    dataTables: ['pages', 'page_versions'],
    onDisable: KEEP,
  },
  {
    id: 'community',
    name: 'Community',
    description: 'Community hub: groups, staff favorites, wishlists, parish links.',
    category: 'community',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: ['community.create', 'community.publish'],
    dependencies: [],
    nav: { label: 'Community', path: '/community', area: 'primary' },
    widgets: [],
    dataTables: ['community_items'],
    onDisable: KEEP,
  },
  {
    id: 'directory',
    name: 'Staff Directory',
    description: 'Staff contact directory.',
    category: 'community',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: ['directory.manage'],
    dependencies: ['community'],
    widgets: [],
    dataTables: ['directory_entries'],
    onDisable: KEEP,
  },
  {
    id: 'volunteer',
    name: 'Volunteer',
    description: 'Volunteer opportunities and sign-up links.',
    category: 'community',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: ['volunteer.create', 'volunteer.publish'],
    dependencies: ['community'],
    widgets: [{ id: 'volunteer', name: 'Volunteer Opportunities', description: 'Open opportunities.' }],
    dataTables: ['volunteer_opportunities'],
    onDisable: KEEP,
  },
  {
    id: 'forms',
    name: 'Forms',
    description: 'Downloadable or online forms with due dates.',
    category: 'school-life',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: ['documents.upload'],
    dependencies: ['documents'],
    widgets: [],
    dataTables: ['documents'],
    onDisable: KEEP,
  },
  {
    id: 'search',
    name: 'Search',
    description: 'Search across permitted content.',
    category: 'core',
    stage: 'core',
    implemented: false,
    configSchema: empty,
    permissions: [],
    dependencies: [],
    widgets: [],
    dataTables: [],
    onDisable: 'Search box is hidden. No data is stored by this module.',
  },
  ...(
    [
      ['family_accounts', 'Family Accounts', 'family'],
      ['student_profiles', 'Student Profiles', 'family'],
      ['teacher_communications', 'Teacher Communications', 'family'],
      ['assignments', 'Assignments', 'family'],
      ['attendance', 'Attendance', 'family'],
      ['grades_sis', 'Grades', 'family'],
      ['tuition_links', 'Tuition Links', 'integration'],
      ['lunch', 'Lunch', 'school-life'],
      ['athletics', 'Athletics', 'school-life'],
      ['clubs', 'Clubs', 'school-life'],
      ['transportation', 'Transportation', 'school-life'],
      ['faith_formation', 'Parish / Faith Formation', 'community'],
      ['facts_integration', 'FACTS Integration', 'integration'],
      ['ai_search', 'AI Search Assistant', 'core'],
      ['notifications', 'Notifications', 'core'],
    ] as const
  ).map(
    ([id, name, category]): ModuleDefinition => ({
      id,
      name,
      description: 'Planned module. Not available yet.',
      category,
      stage: 'future',
      implemented: false,
      configSchema: empty,
      permissions: [],
      dependencies: [],
      widgets: [],
      dataTables: [],
      onDisable: KEEP,
    }),
  ),
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export function getModule(id: string): ModuleDefinition | undefined {
  return BY_ID.get(id);
}
