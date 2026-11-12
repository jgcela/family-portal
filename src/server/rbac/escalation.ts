// Guards against privilege escalation when roles are created, edited or assigned.
// Rule of thumb: you can only hand out what you already hold school-wide, and
// only the School Owner can create or remove other owners.
import { AuthorizationError, can, isOwner, schoolWidePermissions, type AuthzContext, type ScopeType } from './authorize';
import { getPermission, isKnownPermission } from './permissions';

export type RoleSummary = {
  id: string;
  isSystem: boolean;
  isOwnerRole: boolean;
  permissions: string[];
};

function deny(msg: string): never {
  throw new AuthorizationError(msg);
}

export function assertCanAssignRole(
  actor: AuthzContext,
  input: { role: RoleSummary; targetUserId: string; scopeType: ScopeType; scopeId: string | null },
): void {
  if (!can(actor, 'roles.assign')) deny('You do not have permission to assign roles.');
  const actorIsOwner = isOwner(actor);

  if (input.role.isOwnerRole && !actorIsOwner) deny('Only the School Owner can grant the owner role.');
  if (input.role.isOwnerRole && input.scopeType !== 'school') deny('The owner role is always school-wide.');
  if (input.targetUserId === actor.userId && !actorIsOwner) deny('You cannot change your own roles.');

  if (input.scopeType !== 'school') {
    if (input.scopeType !== 'own' && !input.scopeId) deny('A grade or audience scope needs a target.');
    const nonScopable = input.role.permissions.filter((p) => !getPermission(p)?.scopable);
    if (nonScopable.length > 0) {
      deny(`This role includes school-wide permissions (${nonScopable.join(', ')}) and cannot be limited to a grade.`);
    }
  }

  const ceiling = schoolWidePermissions(actor);
  const exceeding = input.role.permissions.filter((p) => !ceiling.has(p));
  if (exceeding.length > 0) deny(`You cannot grant permissions you do not hold: ${exceeding.join(', ')}`);
}

export function assertCanRevokeRole(
  actor: AuthzContext,
  input: { role: RoleSummary; targetUserId: string; remainingOwnerCount: number },
): void {
  if (!can(actor, 'roles.assign')) deny('You do not have permission to change roles.');
  if (input.role.isOwnerRole) {
    if (!isOwner(actor)) deny('Only the School Owner can remove the owner role.');
    if (input.remainingOwnerCount < 1) deny('A school must keep at least one owner.');
  }
  if (input.targetUserId === actor.userId && !isOwner(actor)) deny('You cannot change your own roles.');
}

export function assertCanSetRolePermissions(actor: AuthzContext, role: RoleSummary | null, permissions: string[]): void {
  if (!can(actor, 'roles.manage')) deny('You do not have permission to manage roles.');
  if (role?.isSystem) deny('Built-in roles cannot be edited. Duplicate it as a custom role instead.');
  if (role?.isOwnerRole) deny('The owner role cannot be edited.');
  const unknown = permissions.filter((p) => !isKnownPermission(p));
  if (unknown.length > 0) deny(`Unknown permissions: ${unknown.join(', ')}`);
  const ceiling = schoolWidePermissions(actor);
  const exceeding = permissions.filter((p) => !ceiling.has(p));
  if (exceeding.length > 0) deny(`You cannot grant permissions you do not hold: ${exceeding.join(', ')}`);
}
