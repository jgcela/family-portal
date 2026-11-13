// Who is looking at the family portal, and what they may see.
//
// - public: not signed in, or signed in without an active membership here.
// - family: an active family membership; sees public content plus
//   family-only content for the whole school or for its grades.
// - staff: an active staff membership; sees every published item.
//
// Like authorization contexts, viewers are only trusted when they come from
// loadViewer(), so a tenant id or audience list can't be supplied by a request.
import { and, eq, inArray, or, sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from './db/client';
import { audienceGrades, audiences, familyGrades, memberships, tenants } from './db/schema';
import { AuthorizationError } from './rbac/authorize';

export type Viewer =
  | { readonly kind: 'public' }
  | { readonly kind: 'family'; readonly tenantId: string; readonly userId: string; readonly membershipId: string; readonly audienceIds: readonly string[]; readonly gradeIds: readonly string[] }
  | { readonly kind: 'staff'; readonly tenantId: string; readonly userId: string };

export const PUBLIC_VIEWER: Viewer = Object.freeze({ kind: 'public' });
const verified = new WeakSet<object>([PUBLIC_VIEWER]);

/** Rejects hand-built viewers and viewers from another school (treated as public would hide the bug). */
export function assertViewer(v: Viewer, tenantId: string): void {
  if (!verified.has(v)) throw new AuthorizationError('Unverified viewer.');
  if (v.kind !== 'public' && v.tenantId !== tenantId) throw new AuthorizationError('Viewer belongs to another school.');
}

export async function loadViewer(tenantId: string, userId: string | null | undefined, db: Db = platformDb()): Promise<Viewer> {
  if (!userId) return PUBLIC_VIEWER;
  const [t] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId));
  if (!t || (t.status !== 'active' && t.status !== 'onboarding')) return PUBLIC_VIEWER;
  return withTenant(
    tenantId,
    async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.userId, userId));
      if (!m || m.status !== 'active') return PUBLIC_VIEWER;
      let v: Viewer;
      if (m.kind === 'staff') {
        v = Object.freeze({ kind: 'staff', tenantId, userId });
      } else {
        const grades = (await tx.select({ id: familyGrades.gradeId }).from(familyGrades).where(eq(familyGrades.membershipId, m.id))).map((g) => g.id);
        const rows = await tx
          .selectDistinct({ id: audiences.id })
          .from(audiences)
          .leftJoin(audienceGrades, eq(audienceGrades.audienceId, audiences.id))
          .where(or(eq(audiences.kind, 'school'), grades.length ? and(inArray(audienceGrades.gradeId, grades), ne(audiences.kind, 'staff')) : undefined));
        v = Object.freeze({
          kind: 'family',
          tenantId,
          userId,
          membershipId: m.id,
          audienceIds: Object.freeze(rows.map((r) => r.id)),
          gradeIds: Object.freeze(grades),
        });
      }
      verified.add(v);
      return v;
    },
    db,
  );
}

function ne(col: AnyColumn, value: string): SQL {
  return sql`${col} <> ${value}`;
}

/**
 * SQL condition for rows this viewer may see. Callers still filter on
 * published status; this only decides visibility and audiences.
 */
export function visibleTo(cols: { visibility: AnyColumn; audienceIds: AnyColumn }, v: Viewer): SQL | undefined {
  if (v.kind === 'staff') return undefined;
  if (v.kind === 'public') return sql`${cols.visibility} = 'public'`;
  return or(
    sql`${cols.visibility} = 'public'`,
    and(
      sql`${cols.visibility} = 'families'`,
      or(sql`cardinality(${cols.audienceIds}) = 0`, v.audienceIds.length ? sql`${cols.audienceIds} && ${sql.param([...v.audienceIds])}::uuid[]` : sql`false`),
    ),
  );
}

/** Same rule as visibleTo(), for a row already loaded. */
export function canSee(row: { visibility: string; audienceIds: string[] }, v: Viewer): boolean {
  if (v.kind === 'staff') return true;
  if (row.visibility === 'public') return true;
  if (v.kind === 'public' || row.visibility !== 'families') return false;
  return row.audienceIds.length === 0 || row.audienceIds.some((a) => v.audienceIds.includes(a));
}
