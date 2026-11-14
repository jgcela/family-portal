// Community: teacher wishlists and staff favorites (safe links, who sees them, permissions, import).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { memberships, membershipRoles, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { loadViewer, PUBLIC_VIEWER } from '@/server/viewer';
import {
  countFamilyOnlyCommunity,
  createCommunityItem,
  deleteCommunityItem,
  getCommunityItemForStaff,
  importCommunity,
  listCommunityForStaff,
  listPublicCommunity,
  updateCommunityItem,
} from '@/server/services/community';
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
  a = await createSchool('comm-a');
  b = await createSchool('comm-b');
});
afterAll(async () => {
  await closeDb();
});

describe('community', () => {
  it('wishlists need a secure link; favorites default to signed-in families and drop empty lines', async () => {
    await expect(createCommunityItem(a.ownerCtx, { kind: 'wishlist', name: 'Mrs. A' })).rejects.toThrow(/needs its link/);
    await expect(createCommunityItem(a.ownerCtx, { kind: 'wishlist', name: 'Mrs. A', url: 'javascript:alert(1)' })).rejects.toThrow(/secure web address/);
    await expect(createCommunityItem(a.ownerCtx, { kind: 'wishlist', name: 'Mrs. A', url: 'http://example.org/list' })).rejects.toThrow(/secure web address/);
    await expect(createCommunityItem(a.ownerCtx, { kind: 'other', name: 'X' })).rejects.toThrow();

    const w = await createCommunityItem(a.ownerCtx, { kind: 'wishlist', name: 'Mrs. A', role: '1st Grade', url: 'https://www.amazon.com/hz/wishlist/ls/X' });
    expect(w.visibility).toBe('public');
    const f = await createCommunityItem(a.ownerCtx, {
      kind: 'favorites',
      name: 'Mrs. A',
      details: [
        { label: 'Morning drink', value: 'Latte' },
        { label: 'Candy', value: '' },
      ],
    });
    expect(f.visibility).toBe('families');
    expect(f.details).toEqual([{ label: 'Morning drink', value: 'Latte' }]);
    await expect(updateCommunityItem(a.ownerCtx, f.id, { kind: 'wishlist', name: 'Mrs. A', url: 'https://x.example' })).rejects.toThrow(/change kind/);
  });

  it('shows favorites only to signed-in families and hides items turned off', async () => {
    await createCommunityItem(a.ownerCtx, { kind: 'wishlist', name: 'Hidden', url: 'https://x.example/l', isActive: false });
    const pubW = (await listPublicCommunity(a.tenant.id, 'wishlist', PUBLIC_VIEWER)).map((r) => r.name);
    expect(pubW).toContain('Mrs. A');
    expect(pubW).not.toContain('Hidden');
    expect(await listPublicCommunity(a.tenant.id, 'favorites', PUBLIC_VIEWER)).toEqual([]);
    expect(await countFamilyOnlyCommunity(a.tenant.id, 'favorites')).toBe(1);

    const fam = await loadViewer(a.tenant.id, await member(a, 'family'));
    expect((await listPublicCommunity(a.tenant.id, 'favorites', fam)).map((r) => r.name)).toEqual(['Mrs. A']);
    // Other schools see nothing.
    expect(await listPublicCommunity(b.tenant.id, 'wishlist', PUBLIC_VIEWER)).toEqual([]);
  });

  it('needs community permissions and stays inside the school', async () => {
    const teacher = (await loadAuthzContext(a.tenant.id, await member(a, 'staff', 'teacher')))!;
    await expect(createCommunityItem(teacher, { kind: 'wishlist', name: 'X', url: 'https://x.example' })).rejects.toThrow(/community.create/);
    const coord = (await loadAuthzContext(a.tenant.id, await member(a, 'staff', 'volunteer_coordinator')))!;
    const mine = await createCommunityItem(coord, { kind: 'wishlist', name: 'Coord list', url: 'https://x.example/c' });

    await expect(getCommunityItemForStaff(b.ownerCtx, mine.id)).rejects.toThrow(/not found/);
    await expect(updateCommunityItem(b.ownerCtx, mine.id, { kind: 'wishlist', name: 'Hijack', url: 'https://x.example' })).rejects.toThrow(/not found/);
    await expect(deleteCommunityItem(b.ownerCtx, mine.id)).rejects.toThrow(/not found/);
    await deleteCommunityItem(a.ownerCtx, mine.id);
    expect((await listCommunityForStaff(a.ownerCtx, 'wishlist')).map((r) => r.name)).not.toContain('Coord list');
  });

  it('imports all or nothing and skips items that already exist', async () => {
    const file = {
      items: [
        { kind: 'wishlist', name: 'Ms. B', role: 'Art', url: 'https://www.amazon.com/hz/wishlist/ls/B', groupName: 'Specials' },
        { kind: 'favorites', name: 'Mrs. Smith', role: 'Math Department', details: [{ label: 'Snacks', value: 'Chips' }] },
        { kind: 'favorites', name: 'Mrs. Smith', role: 'Middle School English', details: [] },
      ],
    };
    expect(await importCommunity(b.ownerCtx, JSON.stringify(file))).toEqual({ created: 3, skipped: 0 });
    expect(await importCommunity(b.ownerCtx, JSON.stringify(file))).toEqual({ created: 0, skipped: 3 });
    const bad = { items: [{ kind: 'wishlist', name: 'Ok', url: 'https://x.example' }, { kind: 'wishlist', name: 'Bad', url: 'ftp://x' }] };
    await expect(importCommunity(b.ownerCtx, JSON.stringify(bad))).rejects.toThrow(/Item 2/);
    expect((await listCommunityForStaff(b.ownerCtx, 'wishlist')).map((r) => r.name)).not.toContain('Ok');
    await expect(importCommunity(b.ownerCtx, 'not json')).rejects.toThrow(/not valid JSON/);
  });
});
