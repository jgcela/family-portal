// School links (header button, main menu, Quick access): safe targets, who sees them, permissions, tenancy.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { memberships, membershipRoles, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { loadViewer, PUBLIC_VIEWER } from '@/server/viewer';
import {
  MAX_LINKS_PER_MENU,
  createLink,
  deleteLink,
  getLinkForStaff,
  linkHref,
  listLinksForStaff,
  listMenuLinks,
  safePortalPath,
  updateLink,
} from '@/server/services/links';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

async function member(s: typeof a, kind: 'staff' | 'family', roleKey?: string) {
  const userId = await createUser(kind);
  await withTenant(s.tenant.id, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId: s.tenant.id, userId, kind, status: 'active' }).returning();
    if (roleKey) {
      const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
      await tx.insert(membershipRoles).values({ tenantId: s.tenant.id, membershipId: m!.id, roleId: r!.id, scopeType: 'school' });
    }
  });
  return userId;
}

beforeAll(async () => {
  a = await createSchool('links-a');
  b = await createSchool('links-b');
});
afterAll(async () => {
  await closeDb();
});

describe('school links', () => {
  it('accepts portal paths and web, email or phone links only', async () => {
    expect(safePortalPath('/d/parent-handbook')).toBe('/d/parent-handbook');
    expect(safePortalPath('/p/supply-list#k')).toBe('/p/supply-list#k');
    expect(safePortalPath('//evil.example')).toBeNull();
    expect(safePortalPath('/\\evil.example')).toBeNull();
    expect(safePortalPath('javascript:alert(1)')).toBeNull();
    await expect(createLink(a.ownerCtx, { menu: 'quick', label: 'Bad', target: 'javascript:alert(1)' })).rejects.toThrow(/not a portal path/);
    await expect(createLink(a.ownerCtx, { menu: 'nowhere', label: 'X', target: '/calendar' })).rejects.toThrow();

    const ext = await createLink(a.ownerCtx, { menu: 'header', label: 'FACTS Login', target: 'https://sis.factsmgt.com/accounts/Account/Login', opensInNewTab: true });
    expect(ext.kind).toBe('url');
    expect(linkHref(ext, '/s/x')).toBe('https://sis.factsmgt.com/accounts/Account/Login');
    const local = await createLink(a.ownerCtx, { menu: 'quick', label: 'Handbook', target: '/d/handbook' });
    expect(local.kind).toBe('page');
    expect(linkHref(local, '/s/x')).toBe('/s/x/d/handbook');
  });

  it('shows each link only to the people it is for, in order, and hides inactive ones', async () => {
    await createLink(a.ownerCtx, { menu: 'quick', label: 'Lunch menu', target: '/d/lunch', position: 1 });
    await createLink(a.ownerCtx, { menu: 'quick', label: 'Family directory', target: '/family', visibility: 'families', position: 2 });
    await createLink(a.ownerCtx, { menu: 'quick', label: 'Staff wiki', target: 'https://wiki.example.org', visibility: 'staff', position: 3 });
    await createLink(a.ownerCtx, { menu: 'quick', label: 'Old link', target: '/old', isActive: false });

    const pub = (await listMenuLinks(a.tenant.id, 'quick', PUBLIC_VIEWER)).map((l) => l.label);
    expect(pub).toContain('Lunch menu');
    expect(pub).not.toContain('Family directory');
    expect(pub).not.toContain('Staff wiki');
    expect(pub).not.toContain('Old link');

    const fam = await loadViewer(a.tenant.id, await member(a, 'family'));
    const famLabels = (await listMenuLinks(a.tenant.id, 'quick', fam)).map((l) => l.label);
    expect(famLabels).toContain('Family directory');
    expect(famLabels).not.toContain('Staff wiki');

    const ordered = (await listMenuLinks(a.tenant.id, 'quick', PUBLIC_VIEWER)).filter((l) => ['Lunch menu', 'Handbook'].includes(l.label)).map((l) => l.label);
    expect(ordered).toEqual(['Handbook', 'Lunch menu']);

    // Other schools never see these links.
    expect(await listMenuLinks(b.tenant.id, 'quick', PUBLIC_VIEWER)).toEqual([]);
  });

  it('needs navigation.manage and stays inside the school', async () => {
    const teacher = (await loadAuthzContext(a.tenant.id, await member(a, 'staff', 'teacher')))!;
    await expect(createLink(teacher, { menu: 'quick', label: 'X', target: '/x' })).rejects.toThrow(/navigation.manage/);
    await expect(listLinksForStaff(teacher)).rejects.toThrow(/navigation.manage/);

    const [mine] = await listLinksForStaff(a.ownerCtx);
    await expect(getLinkForStaff(b.ownerCtx, mine!.id)).rejects.toThrow(/not found/);
    await expect(updateLink(b.ownerCtx, mine!.id, { menu: 'quick', label: 'Hijack', target: '/x' })).rejects.toThrow(/not found/);
    await expect(deleteLink(b.ownerCtx, mine!.id)).rejects.toThrow(/not found/);

    const edited = await updateLink(a.ownerCtx, mine!.id, { menu: mine!.menu, label: 'Renamed', target: mine!.target });
    expect(edited.label).toBe('Renamed');
    await deleteLink(a.ownerCtx, mine!.id);
    await expect(getLinkForStaff(a.ownerCtx, mine!.id)).rejects.toThrow(/not found/);
  });

  it(`limits each menu to ${MAX_LINKS_PER_MENU} links`, async () => {
    for (let i = 0; i < MAX_LINKS_PER_MENU; i++) await createLink(b.ownerCtx, { menu: 'primary', label: `L${i}`, target: `/p/${i}` });
    await expect(createLink(b.ownerCtx, { menu: 'primary', label: 'One more', target: '/p/x' })).rejects.toThrow(/already has/);
  });
});
