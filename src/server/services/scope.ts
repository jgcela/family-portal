// Shared helpers for audience-scoped content (events, announcements, pages).
import { eq, inArray } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { audienceGrades, audiences, tenantSettings } from '../db/schema';
import type { ResourceRef } from '../rbac/authorize';
import { ValidationError } from './modules';

/** Builds the authorization resource for a record's audiences (audiences → grades). */
export async function eventResource(tx: Tx, audienceIds: string[], authorUserId: string | null): Promise<ResourceRef> {
  if (!audienceIds.length) return { audienceIds: [], gradeIds: [], authorUserId };
  const found = await tx.select({ id: audiences.id }).from(audiences).where(inArray(audiences.id, audienceIds));
  if (found.length !== new Set(audienceIds).size) throw new ValidationError('One of the selected audiences does not exist.');
  const g = await tx
    .selectDistinct({ gradeId: audienceGrades.gradeId })
    .from(audienceGrades)
    .where(inArray(audienceGrades.audienceId, audienceIds));
  return { audienceIds, gradeIds: g.map((x) => x.gradeId), authorUserId };
}

/** Audience → grade links for many records at once (for filtering lists). */
export async function gradeLookup(tx: Tx, audienceIds: string[]) {
  const links = audienceIds.length
    ? await tx.select().from(audienceGrades).where(inArray(audienceGrades.audienceId, [...new Set(audienceIds)]))
    : [];
  return (ids: string[]) => [...new Set(links.filter((l) => ids.includes(l.audienceId)).map((l) => l.gradeId))];
}

export async function settingsFor(tx: Tx, tenantId: string) {
  const [s] = await tx.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  return { requireApproval: s?.requireApproval ?? false, independentApproval: s?.independentApproval ?? true };
}
