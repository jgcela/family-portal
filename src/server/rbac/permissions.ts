// Permission catalog: resource.action. This list is the single source of truth.
// Roles store permission keys; unknown keys are rejected on write.
//
// `scopable` permissions may be granted for a grade or an audience instead of
// the whole school (e.g. a Preschool Coordinator). Administrative permissions
// are never scopable: they only count when granted school-wide.

export type PermissionDef = {
  key: string;
  group: PermissionGroup;
  label: string;
  scopable: boolean;
  /** Sensitive permissions can only be granted by the School Owner role. */
  ownerOnly?: boolean;
};

export type PermissionGroup =
  | 'Content'
  | 'School life'
  | 'People'
  | 'Portal design'
  | 'Modules'
  | 'Settings';

const content = (resource: string, label: string, group: PermissionGroup = 'Content'): PermissionDef[] => [
  { key: `${resource}.view`, group, label: `View ${label} (incl. drafts)`, scopable: true },
  { key: `${resource}.create`, group, label: `Create ${label}`, scopable: true },
  { key: `${resource}.edit`, group, label: `Edit ${label}`, scopable: true },
  { key: `${resource}.publish`, group, label: `Publish ${label}`, scopable: true },
  { key: `${resource}.approve`, group, label: `Approve ${label}`, scopable: true },
  { key: `${resource}.archive`, group, label: `Archive ${label}`, scopable: true },
  { key: `${resource}.delete`, group, label: `Delete ${label}`, scopable: true },
];

export const PERMISSIONS: readonly PermissionDef[] = [
  { key: 'dashboard.view', group: 'Content', label: 'Open the admin dashboard', scopable: true },
  ...content('announcements', 'announcements'),
  ...content('pages', 'pages'),
  ...content('resources', 'resources'),
  ...content('documents', 'documents'),
  { key: 'documents.upload', group: 'Content', label: 'Upload documents', scopable: true },
  { key: 'media.upload', group: 'Content', label: 'Upload media', scopable: true },
  { key: 'media.delete', group: 'Content', label: 'Delete media', scopable: false },
  ...content('events', 'events', 'School life'),
  { key: 'events.import', group: 'School life', label: 'Import calendars', scopable: true },
  { key: 'calendars.manage', group: 'School life', label: 'Create and configure calendars', scopable: false },
  ...content('action_items', 'action items', 'School life'),
  ...content('community', 'community content', 'School life'),
  ...content('volunteer', 'volunteer opportunities', 'School life'),
  { key: 'directory.manage', group: 'School life', label: 'Manage the staff directory', scopable: false },
  { key: 'users.view', group: 'People', label: 'View staff and families', scopable: false },
  { key: 'users.invite', group: 'People', label: 'Invite people', scopable: false },
  { key: 'users.suspend', group: 'People', label: 'Suspend people', scopable: false },
  { key: 'users.remove', group: 'People', label: 'Remove people', scopable: false },
  { key: 'roles.view', group: 'People', label: 'View roles', scopable: false },
  { key: 'roles.manage', group: 'People', label: 'Create and edit custom roles', scopable: false },
  { key: 'roles.assign', group: 'People', label: 'Assign roles', scopable: false },
  { key: 'audiences.manage', group: 'People', label: 'Manage audiences and grades', scopable: false },
  { key: 'branding.manage', group: 'Portal design', label: 'Edit branding drafts', scopable: false },
  { key: 'branding.publish', group: 'Portal design', label: 'Publish branding', scopable: false },
  { key: 'homepage.edit', group: 'Portal design', label: 'Edit the homepage draft', scopable: false },
  { key: 'homepage.publish', group: 'Portal design', label: 'Publish the homepage', scopable: false },
  { key: 'navigation.manage', group: 'Portal design', label: 'Edit navigation', scopable: false },
  { key: 'modules.view', group: 'Modules', label: 'View modules', scopable: false },
  { key: 'modules.configure', group: 'Modules', label: 'Configure modules', scopable: false },
  { key: 'modules.toggle', group: 'Modules', label: 'Enable and disable modules', scopable: false },
  { key: 'integrations.manage', group: 'Modules', label: 'Manage integrations', scopable: false, ownerOnly: true },
  { key: 'settings.manage', group: 'Settings', label: 'Edit school profile and settings', scopable: false },
  { key: 'academic_years.manage', group: 'Settings', label: 'Manage academic years', scopable: false },
  { key: 'notifications.send', group: 'Settings', label: 'Send notifications', scopable: false },
  { key: 'exports.run', group: 'Settings', label: 'Export school data', scopable: false },
  { key: 'audit.view', group: 'Settings', label: 'View the activity log', scopable: false },
  { key: 'billing.view', group: 'Settings', label: 'View plan and billing', scopable: false },
  { key: 'domains.manage', group: 'Settings', label: 'Manage domains', scopable: false, ownerOnly: true },
  { key: 'security.manage', group: 'Settings', label: 'Manage security settings', scopable: false, ownerOnly: true },
  { key: 'support.grant', group: 'Settings', label: 'Approve platform support access', scopable: false, ownerOnly: true },
] as const;

export type Permission = string;

const BY_KEY = new Map(PERMISSIONS.map((p) => [p.key, p]));

export function getPermission(key: string): PermissionDef | undefined {
  return BY_KEY.get(key);
}

export function isKnownPermission(key: string): boolean {
  return BY_KEY.has(key);
}

export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSIONS.map((p) => p.key);
