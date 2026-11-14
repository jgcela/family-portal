// Default school roles, created for every new tenant. Schools can add custom
// roles; the system ones keep fixed permission sets so upgrades stay predictable.
import { ALL_PERMISSION_KEYS, PERMISSIONS } from './permissions';

export type RoleTemplate = {
  key: string;
  name: string;
  description: string;
  isOwnerRole?: boolean;
  permissions: string[];
};

const keysWhere = (pred: (key: string) => boolean) => ALL_PERMISSION_KEYS.filter(pred);
const actions = (resources: string[], acts: string[]) => resources.flatMap((r) => acts.map((a) => `${r}.${a}`));

const OWNER_ONLY = new Set(PERMISSIONS.filter((p) => p.ownerOnly).map((p) => p.key));
const COMMS_RESOURCES = ['announcements', 'pages', 'resources', 'documents', 'events', 'action_items'];
const ALL_CONTENT_ACTIONS = ['view', 'create', 'edit', 'publish', 'approve', 'archive', 'delete'];

const TEMPLATES: RoleTemplate[] = [
  {
    key: 'owner',
    name: 'School Owner / Principal',
    description: 'Full authority within this school, including ownership, security and domains.',
    isOwnerRole: true,
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    key: 'school_admin',
    name: 'School Administrator',
    description: 'Runs day-to-day operations. Cannot change ownership, security, domains or support access.',
    permissions: keysWhere((k) => !OWNER_ONLY.has(k)),
  },
  {
    key: 'communications_manager',
    name: 'Communications Manager',
    description: 'Announcements, newsletters, pages, calendar, resources, homepage content and media.',
    permissions: [
      'dashboard.view',
      ...actions(COMMS_RESOURCES, ALL_CONTENT_ACTIONS),
      'documents.upload',
      'events.import',
      'media.upload',
      'media.delete',
      'homepage.edit',
      'homepage.publish',
      'navigation.manage',
      'notifications.send',
      'modules.view',
    ],
  },
  {
    key: 'content_editor',
    name: 'Content Editor',
    description: 'Creates and edits content. Publishing may require approval.',
    permissions: [
      'dashboard.view',
      ...actions(COMMS_RESOURCES, ['view', 'create', 'edit']),
      'documents.upload',
      'media.upload',
    ],
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Manages classroom or grade information. Usually granted for specific grades.',
    permissions: [
      'dashboard.view',
      ...actions(['announcements', 'events', 'resources', 'documents'], ['view', 'create', 'edit']),
      'documents.upload',
      'media.upload',
    ],
  },
  {
    key: 'volunteer_coordinator',
    name: 'Volunteer Coordinator',
    description: 'Manages volunteer opportunities and related community content.',
    permissions: ['dashboard.view', ...actions(['volunteer'], ALL_CONTENT_ACTIONS), 'media.upload'],
  },
  {
    key: 'reviewer',
    name: 'Read-Only Reviewer',
    description: 'Can inspect permitted content without changing it.',
    permissions: [
      'dashboard.view',
      ...keysWhere((k) => k.endsWith('.view') && k !== 'users.view'),
    ],
  },
  {
    key: 'parent',
    name: 'Parent',
    description: 'Family member. Sees public content and authorized family content. No admin access.',
    permissions: [],
  },
];

export const ROLE_TEMPLATES: RoleTemplate[] = TEMPLATES.map((t) => ({
  ...t,
  permissions: [...new Set(t.permissions)],
}));

export function getRoleTemplate(key: string) {
  return ROLE_TEMPLATES.find((r) => r.key === key);
}
