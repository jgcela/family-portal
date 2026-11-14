// Links the school places around the portal: extra items in the main menu,
// buttons in the header (FACTS login) and the homepage "Quick access" list.
// Stored in navigation_items (RLS-protected), one row per link; `menu` says
// where it shows. Changes are live at once and audited.
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, withTenant, type Db, type Tx } from '../db/client';
import { navigationItems } from '../db/schema';
import { audit } from '../audit/log';
import { assertVerifiedContext } from '../rbac/context';
import { AuthorizationError, hasAnywhere, type AuthzContext } from '../rbac/authorize';
import { assertViewer, type Viewer } from '../viewer';
import { ValidationError } from '../errors';
import { safeActionUrl } from './volunteer';

export type LinkRow = typeof navigationItems.$inferSelect;

export const LINK_MENUS = {
  primary: { label: 'Main menu', hint: 'Added after the module links at the top of every page.' },
  header: { label: 'Header button', hint: 'A highlighted button next to "Sign in", such as a FACTS login.' },
  quick: { label: 'Quick access', hint: 'The list of shortcuts on the homepage.' },
} as const;
export type LinkMenu = keyof typeof LINK_MENUS;
export const MAX_LINKS_PER_MENU = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A path inside this portal ("/documents", "/d/parent-handbook", "/p/supply-list#k")
 * or null. Refuses "//host" and anything with spaces or a scheme.
 */
export function safePortalPath(raw: string): string | null {
  const v = raw.trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return null;
  return /^\/[A-Za-z0-9\-._~/%?=&#+]*$/.test(v) ? v : null;
}

export const linkInputSchema = z
  .object({
    menu: z.enum(['primary', 'header', 'quick']),
    label: z.string().trim().min(1, 'Label is required.').max(60, 'Label is too long (60 characters maximum).'),
    target: z.string().trim().min(1, 'Link is required.').max(2048),
    visibility: z.enum(['public', 'families', 'staff']).default('public'),
    opensInNewTab: z.boolean().default(false),
    isActive: z.boolean().default(true),
    position: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict()
  .transform((v, c) => {
    const path = safePortalPath(v.target);
    const url = path ? null : safeActionUrl(v.target);
    if (!path && !url) {
      c.addIssue({
        code: 'custom',
        path: ['target'],
        message: `"${v.target}" is not a portal path (starting with /) or a web address, email (mailto:) or phone (tel:).`,
      });
      return z.NEVER;
    }
    return { ...v, kind: path ? ('page' as const) : ('url' as const), target: (path ?? url)! };
  });

function parse(input: unknown) {
  const p = linkInputSchema.safeParse(input);
  if (!p.success) throw new ValidationError(p.error.issues.map((i) => i.message).join('; '));
  return p.data;
}

function assertManage(ctx: AuthzContext) {
  assertVerifiedContext(ctx);
  if (ctx.support) throw new AuthorizationError('Support sessions are read-only.');
  if (!hasAnywhere(ctx, 'navigation.manage')) throw new AuthorizationError('Not allowed: navigation.manage', 'navigation.manage');
}

async function load(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new ValidationError('Link not found.');
  const [row] = await tx.select().from(navigationItems).where(eq(navigationItems.id, id));
  if (!row) throw new ValidationError('Link not found.');
  return row;
}

async function countIn(tx: Tx, menu: string) {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(navigationItems).where(eq(navigationItems.menu, menu));
  return r?.n ?? 0;
}

export async function listLinksForStaff(ctx: AuthzContext, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'navigation.manage')) throw new AuthorizationError('Not allowed: navigation.manage', 'navigation.manage');
  return withTenant(ctx.tenantId, (tx) => tx.select().from(navigationItems).orderBy(asc(navigationItems.menu), asc(navigationItems.position), asc(navigationItems.label)), db);
}

export async function getLinkForStaff(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertVerifiedContext(ctx);
  if (!hasAnywhere(ctx, 'navigation.manage')) throw new AuthorizationError('Not allowed: navigation.manage', 'navigation.manage');
  return withTenant(ctx.tenantId, (tx) => load(tx, id), db);
}

export async function createLink(ctx: AuthzContext, input: unknown, db: Db = platformDb()) {
  assertManage(ctx);
  const cols = parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      if ((await countIn(tx, cols.menu)) >= MAX_LINKS_PER_MENU) {
        throw new ValidationError(`${LINK_MENUS[cols.menu].label} already has ${MAX_LINKS_PER_MENU} links. Remove one first.`);
      }
      const [row] = await tx
        .insert(navigationItems)
        .values({ ...cols, tenantId: ctx.tenantId })
        .returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'link.created', targetType: 'link', targetId: row!.id, metadata: { menu: cols.menu, label: cols.label } });
      return row!;
    },
    db,
  );
}

export async function updateLink(ctx: AuthzContext, id: string, input: unknown, db: Db = platformDb()) {
  assertManage(ctx);
  const cols = parse(input);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      if (cur.menu !== cols.menu && (await countIn(tx, cols.menu)) >= MAX_LINKS_PER_MENU) {
        throw new ValidationError(`${LINK_MENUS[cols.menu].label} already has ${MAX_LINKS_PER_MENU} links. Remove one first.`);
      }
      const [row] = await tx.update(navigationItems).set(cols).where(eq(navigationItems.id, id)).returning();
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'link.updated', targetType: 'link', targetId: id, metadata: { menu: cols.menu, label: cols.label } });
      return row!;
    },
    db,
  );
}

export async function deleteLink(ctx: AuthzContext, id: string, db: Db = platformDb()) {
  assertManage(ctx);
  return withTenant(
    ctx.tenantId,
    async (tx) => {
      const cur = await load(tx, id);
      await tx.delete(navigationItems).where(eq(navigationItems.id, id));
      await audit(tx, { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'link.deleted', targetType: 'link', targetId: id, metadata: { menu: cur.menu, label: cur.label } });
    },
    db,
  );
}

/** Whether a link with this visibility shows to this viewer. */
export function linkVisibleTo(visibility: LinkRow['visibility'], viewer: Viewer) {
  if (viewer.kind === 'staff') return true;
  if (visibility === 'public') return true;
  return visibility === 'families' && viewer.kind === 'family';
}

/** The href to render: portal paths get the school's base prefix, web addresses stay as they are. */
export function linkHref(row: Pick<LinkRow, 'kind' | 'target'>, base: string) {
  return row.kind === 'url' ? row.target : `${base}${row.target}`;
}

/** Active links of one menu, already filtered for this viewer. */
export async function listMenuLinks(tenantId: string, menu: LinkMenu, viewer: Viewer, db: Db = platformDb()) {
  assertViewer(viewer, tenantId);
  const rows = await withTenant(
    tenantId,
    (tx) =>
      tx
        .select()
        .from(navigationItems)
        .where(and(eq(navigationItems.menu, menu), eq(navigationItems.isActive, true)))
        .orderBy(asc(navigationItems.position), asc(navigationItems.label)),
    db,
  );
  return rows.filter((r) => linkVisibleTo(r.visibility, viewer));
}
