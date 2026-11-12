// Content workflow shared by events, announcements and pages:
// Draft → (In review → Approved) → Published → Archived.
import { AuthorizationError, assertCan, canApprove, type AuthzContext, type ResourceRef } from '../rbac/authorize';
import { ValidationError } from './modules';

export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'archived';
export type Transition = 'submit' | 'approve' | 'publish' | 'unpublish' | 'archive' | 'restore';
export type WorkflowSettings = { requireApproval: boolean; independentApproval: boolean };

/**
 * Checks permissions and the current state, and returns the next status.
 * `resourceType` is the permission prefix (events, announcements, pages).
 */
export function nextStatus(
  ctx: AuthzContext,
  resourceType: string,
  label: string,
  current: ContentStatus,
  action: Transition,
  res: ResourceRef,
  settings: WorkflowSettings,
): ContentStatus {
  switch (action) {
    case 'submit':
      assertCan(ctx, `${resourceType}.edit`, res);
      if (current !== 'draft') throw new ValidationError('Only drafts can be sent for review.');
      return 'in_review';
    case 'approve':
      if (current !== 'in_review') throw new ValidationError(`Only ${label}s in review can be approved.`);
      if (!canApprove(ctx, resourceType, res, settings)) {
        throw new AuthorizationError(
          settings.independentApproval && res.authorUserId === ctx.userId
            ? `Someone else must approve a ${label} you created.`
            : `Not allowed: ${resourceType}.approve`,
          `${resourceType}.approve`,
        );
      }
      return 'approved';
    case 'publish':
      assertCan(ctx, `${resourceType}.publish`, res);
      if (current === 'published') throw new ValidationError(`This ${label} is already published.`);
      if (current === 'archived') throw new ValidationError(`Restore the ${label} before publishing it.`);
      if (settings.requireApproval && current !== 'approved') {
        throw new ValidationError(`This school requires approval before publishing. Send the ${label} for review first.`);
      }
      return 'published';
    case 'unpublish':
      assertCan(ctx, `${resourceType}.publish`, res);
      if (current !== 'published') throw new ValidationError(`This ${label} is not published.`);
      return 'draft';
    case 'archive':
      assertCan(ctx, `${resourceType}.archive`, res);
      return 'archived';
    case 'restore':
      assertCan(ctx, `${resourceType}.archive`, res);
      if (current !== 'archived') throw new ValidationError(`This ${label} is not archived.`);
      return 'draft';
  }
}

/** Which transitions to offer in the UI (the server re-checks each one). */
export function availableTransitions(
  can: (permission: string) => boolean,
  resourceType: string,
  current: ContentStatus,
  settings: WorkflowSettings,
): Transition[] {
  const out: Transition[] = [];
  const pub = can(`${resourceType}.publish`);
  if (current === 'draft' && settings.requireApproval && can(`${resourceType}.edit`)) out.push('submit');
  if (current === 'in_review' && can(`${resourceType}.approve`)) out.push('approve');
  if (pub && (current === 'approved' || (current === 'draft' && !settings.requireApproval))) out.push('publish');
  if (pub && current === 'published') out.push('unpublish');
  if (can(`${resourceType}.archive`)) out.push(current === 'archived' ? 'restore' : 'archive');
  return out;
}
