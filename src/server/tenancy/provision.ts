// Creates a fully configured school tenant. Used by the seed script, tests and
// (Phase 5) the New School Wizard. Platform rows are written with the owner
// connection; every school-owned row is written through withTenant(), so RLS
// verifies the tenant boundary even during provisioning.
import { eq } from 'drizzle-orm';
import { platformDb, withTenant, type Db } from '../db/client';
import {
  academicYears,
  audienceGrades,
  audiences,
  grades,
  homepageVersions,
  membershipRoles,
  memberships,
  rolePermissions,
  roles,
  schoolProfiles,
  subscriptions,
  tenantDomains,
  tenantModules,
  tenantSettings,
  calendars,
  tenants,
  themeVersions,
} from '../db/schema';
import { audit } from '../audit/log';
import { MODULES } from '../modules/registry';
import { ROLE_TEMPLATES } from '../rbac/role-templates';
import { DEFAULT_THEME, themeTokensSchema, type ThemeTokens } from '../theme/tokens';
import { DEFAULT_HOMEPAGE } from './homepage-defaults';
import { isValidSlug } from './resolve';

export type GradeInput = { code: string; name: string; level: 'preschool' | 'elementary' | 'middle' | 'high' | 'other' };

export const PK8_GRADES: GradeInput[] = [
  { code: 'PK3', name: 'Preschool 3', level: 'preschool' },
  { code: 'PK4', name: 'Preschool 4', level: 'preschool' },
  { code: 'K', name: 'Kindergarten', level: 'elementary' },
  ...[1, 2, 3, 4, 5].map((n) => ({ code: String(n), name: `Grade ${n}`, level: 'elementary' as const })),
  ...[6, 7, 8].map((n) => ({ code: String(n), name: `Grade ${n}`, level: 'middle' as const })),
];

const LEVEL_NAMES: Record<GradeInput['level'], string> = {
  preschool: 'Preschool',
  elementary: 'Elementary',
  middle: 'Middle School',
  high: 'High School',
  other: 'Other',
};

export type ProvisionInput = {
  slug: string;
  name: string;
  timezone?: string;
  planId: string;
  status?: 'onboarding' | 'active';
  profile?: Partial<typeof schoolProfiles.$inferInsert>;
  grades?: GradeInput[];
  academicYear?: { label: string; startsOn: string; endsOn: string };
  theme?: ThemeTokens;
  enabledModules?: string[];
  ownerUserId?: string;
  createdByUserId?: string | null;
  subdomainHost?: string;
};

export async function provisionTenant(input: ProvisionInput, db: Db = platformDb()) {
  if (!isValidSlug(input.slug)) throw new Error(`Invalid or reserved slug: ${input.slug}`);
  const theme = themeTokensSchema.parse(input.theme ?? DEFAULT_THEME);

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: input.slug,
      name: input.name,
      timezone: input.timezone ?? 'America/Denver',
      status: input.status ?? 'onboarding',
    })
    .returning();
  if (!tenant) throw new Error('Tenant insert failed');

  try {
    await db.insert(subscriptions).values({ tenantId: tenant.id, planId: input.planId, status: 'trialing' });
    if (input.subdomainHost) {
      await db.insert(tenantDomains).values({
        tenantId: tenant.id,
        hostname: input.subdomainHost,
        kind: 'subdomain',
        isPrimary: true,
        verifiedAt: new Date(),
      });
    }

    await withTenant(
      tenant.id,
      async (tx) => {
        const tenantId = tenant.id;
        await tx.insert(schoolProfiles).values({ displayName: input.name, ...input.profile, tenantId });
        await tx.insert(tenantSettings).values({ tenantId });
        // Every school starts with one public calendar; more can be added later.
        await tx.insert(calendars).values({ tenantId, key: 'school', name: 'School Calendar', isPublic: true });
        await tx.insert(themeVersions).values({
          tenantId,
          status: 'published',
          tokens: theme,
          publishedAt: new Date(),
          createdByUserId: input.createdByUserId ?? null,
        });
        await tx.insert(homepageVersions).values({
          tenantId,
          status: 'published',
          blocks: DEFAULT_HOMEPAGE,
          publishedAt: new Date(),
        });

        if (input.academicYear) {
          await tx.insert(academicYears).values({ tenantId, ...input.academicYear, isCurrent: true });
        }

        // Grades and audiences
        const gradeRows = await tx
          .insert(grades)
          .values((input.grades ?? PK8_GRADES).map((g, i) => ({ tenantId, ...g, sortOrder: i })))
          .returning();
        const [schoolAud] = await tx
          .insert(audiences)
          .values({ tenantId, key: 'all-school', name: 'All School', kind: 'school', isSystem: true })
          .returning();
        await tx.insert(audiences).values({ tenantId, key: 'staff', name: 'Staff', kind: 'staff', isSystem: true });
        const levels = [...new Set(gradeRows.map((g) => g.level))];
        for (const level of levels) {
          const [aud] = await tx
            .insert(audiences)
            .values({ tenantId, key: `level-${level}`, name: LEVEL_NAMES[level], kind: 'level', isSystem: true })
            .returning();
          const ids = gradeRows.filter((g) => g.level === level).map((g) => g.id);
          if (aud && ids.length) {
            await tx.insert(audienceGrades).values(ids.map((gradeId) => ({ tenantId, audienceId: aud.id, gradeId })));
          }
        }
        for (const g of gradeRows) {
          const [aud] = await tx
            .insert(audiences)
            .values({ tenantId, key: `grade-${g.code.toLowerCase()}`, name: g.name, kind: 'grade', isSystem: true })
            .returning();
          if (aud) await tx.insert(audienceGrades).values({ tenantId, audienceId: aud.id, gradeId: g.id });
        }
        void schoolAud;

        // Roles
        const roleIds: Record<string, string> = {};
        for (const tpl of ROLE_TEMPLATES) {
          const [r] = await tx
            .insert(roles)
            .values({
              tenantId,
              key: tpl.key,
              name: tpl.name,
              description: tpl.description,
              isSystem: true,
              isOwnerRole: !!tpl.isOwnerRole,
            })
            .returning();
          roleIds[tpl.key] = r!.id;
          if (tpl.permissions.length) {
            await tx
              .insert(rolePermissions)
              .values(tpl.permissions.map((permission) => ({ tenantId, roleId: r!.id, permission })));
          }
        }

        // Modules: insert a row per known module so admins see the full catalog state.
        const wanted = new Set(input.enabledModules ?? []);
        await tx.insert(tenantModules).values(
          MODULES.map((m, i) => ({
            tenantId,
            moduleId: m.id,
            enabled: !!m.required || (wanted.has(m.id) && m.implemented),
            navOrder: i,
          })),
        );

        if (input.ownerUserId) {
          const [m] = await tx
            .insert(memberships)
            .values({ tenantId, userId: input.ownerUserId, kind: 'staff', status: 'active', title: 'Principal' })
            .returning();
          await tx.insert(membershipRoles).values({
            tenantId,
            membershipId: m!.id,
            roleId: roleIds.owner!,
            scopeType: 'school',
            grantedByUserId: input.createdByUserId ?? null,
          });
        }

        await audit(tx, {
          tenantId,
          actorUserId: input.createdByUserId ?? null,
          actorKind: input.createdByUserId ? 'platform' : 'system',
          action: 'tenant.provisioned',
          targetType: 'tenant',
          targetId: tenantId,
          metadata: { slug: input.slug, planId: input.planId },
        });
      },
      db,
    );
  } catch (err) {
    // Roll back the platform rows too so a failed provisioning leaves nothing behind.
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    throw err;
  }

  return tenant;
}
