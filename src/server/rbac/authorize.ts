// Pure authorization logic. No I/O here, so every rule is unit-testable.
// Deny by default: a permission is allowed only by an explicit matching grant.
import { getPermission, isKnownPermission } from './permissions';

export type ScopeType = 'school' | 'grade' | 'audience' | 'own';

export type Grant = {
  permission: string;
  scopeType: ScopeType;
  scopeId: string | null;
  roleId: string;
  isOwnerRole: boolean;
};

export type AuthzContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  membershipStatus: 'invited' | 'active' | 'suspended';
  grants: Grant[];
  /** Set for a platform support session: read-only access approved by the school. */
  support?: { grantId: string; expiresAt: Date; scopes: string[] };
};

/** What the action is about. Omit for actions that are not about one record. */
export type ResourceRef = {
  /** Grades the record targets. Empty/undefined = school-wide record. */
  gradeIds?: string[];
  /** Audiences the record targets. */
  audienceIds?: string[];
  /** Author of the record, for "own" scopes and separation of duties. */
  authorUserId?: string | null;
};

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(
    message: string,
    readonly permission?: string,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

function isActive(ctx: AuthzContext) {
  return ctx.membershipStatus === 'active';
}

export function isOwner(ctx: AuthzContext): boolean {
  return isActive(ctx) && ctx.grants.some((g) => g.isOwnerRole && g.scopeType === 'school');
}

/** True if a grant covers the given resource. */
function grantCovers(grant: Grant, resource: ResourceRef | undefined, userId: string): boolean {
  switch (grant.scopeType) {
    case 'school':
      return true;
    case 'own':
      return !!resource && !!resource.authorUserId && resource.authorUserId === userId;
    case 'grade': {
      const ids = resource?.gradeIds ?? [];
      // A grade-scoped grant never covers school-wide records.
      return ids.length > 0 && grant.scopeId !== null && ids.every((id) => id === grant.scopeId);
    }
    case 'audience': {
      const ids = resource?.audienceIds ?? [];
      return ids.length > 0 && grant.scopeId !== null && ids.every((id) => id === grant.scopeId);
    }
  }
}

/**
 * can(ctx, 'events.publish', { gradeIds: [grade5] })
 *
 * A record targeting several grades needs coverage for every one of them;
 * coverage may come from several grade-scoped grants combined.
 */
export function can(ctx: AuthzContext | null, permission: string, resource?: ResourceRef): boolean {
  if (!ctx || !isActive(ctx)) return false;
  const def = getPermission(permission);
  if (!def) return false;

  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return false;

  // Non-scopable permissions only count when granted school-wide.
  if (!def.scopable) return grants.some((g) => g.scopeType === 'school');

  if (grants.some((g) => grantCovers(g, resource, ctx.userId))) return true;

  // Multi-grade records: allow if each grade is covered by some grade grant.
  const gradeIds = resource?.gradeIds ?? [];
  if (gradeIds.length > 1) {
    const covered = new Set(grants.filter((g) => g.scopeType === 'grade').map((g) => g.scopeId));
    if (gradeIds.every((id) => covered.has(id))) return true;
  }
  const audienceIds = resource?.audienceIds ?? [];
  if (audienceIds.length > 1) {
    const covered = new Set(grants.filter((g) => g.scopeType === 'audience').map((g) => g.scopeId));
    if (audienceIds.every((id) => covered.has(id))) return true;
  }
  return false;
}

export function assertCan(ctx: AuthzContext | null, permission: string, resource?: ResourceRef): asserts ctx is AuthzContext {
  if (!can(ctx, permission, resource)) {
    throw new AuthorizationError(`Not allowed: ${permission}`, permission);
  }
}

/** Whether the user holds the permission anywhere (used to show/hide UI). */
export function hasAnywhere(ctx: AuthzContext | null, permission: string): boolean {
  if (!ctx || !isActive(ctx) || !isKnownPermission(permission)) return false;
  const def = getPermission(permission)!;
  return ctx.grants.some((g) => g.permission === permission && (def.scopable || g.scopeType === 'school'));
}

/**
 * Approval with separation of duties: when the school requires independent
 * approval, an author can never approve their own work, whatever their role.
 */
export function canApprove(
  ctx: AuthzContext | null,
  resourceType: string,
  resource: ResourceRef,
  settings: { independentApproval: boolean },
): boolean {
  if (!can(ctx, `${resourceType}.approve`, resource)) return false;
  if (settings.independentApproval && resource.authorUserId && resource.authorUserId === ctx!.userId) return false;
  return true;
}

/** Permissions this context holds school-wide (the ceiling for what it can delegate). */
export function schoolWidePermissions(ctx: AuthzContext): Set<string> {
  if (!isActive(ctx)) return new Set();
  return new Set(ctx.grants.filter((g) => g.scopeType === 'school').map((g) => g.permission));
}
