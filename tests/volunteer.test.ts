// Volunteer opportunities: workflow, who sees them, safe links, and import from a file.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { memberships, membershipRoles, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { loadViewer, PUBLIC_VIEWER } from '@/server/viewer';
import {
  createVolunteer,
  deleteVolunteer,
  importVolunteer,
  listPublicVolunteer,
  listVolunteerForStaff,
  safeActionUrl,
  transitionVolunteer,
  updateVolunteer,
} from '@/server/services/volunteer';
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
  a = await createSchool('vol-a');
  b = await createSchool('vol-b');
});
afterAll(async () => {
  await closeDb();
});

describe('volunteer opportunities', () => {
  it('only allows web, email and phone links', () => {
    expect(safeActionUrl('https://www.signupgenius.com/go/abc')).toBe('https://www.signupgenius.com/go/abc');
    expect(safeActionUrl('mailto:office@example.org')).toBe('mailto:office@example.org');
    expect(safeActionUrl('tel:+1 303 555 0100')).toBe('tel:+13035550100');
    expect(safeActionUrl('javascript:alert(1)')).toBeNull();
    expect(safeActionUrl('data:text/html,hi')).toBeNull();
    expect(safeActionUrl('mailto:not an email')).toBeNull();
  });

  it('drafts are hidden; published family items need a signed-in family', async () => {
    await expect(createVolunteer(a.ownerCtx, { title: 'Bad', actions: [{ label: 'Go', url: 'javascript:alert(1)' }] })).rejects.toThrow(/not a web address/);
    const fam = await createVolunteer(a.ownerCtx, {
      title: 'Pizza Fridays',
      category: 'Classroom',
      schedule: 'Fridays',
      summary: 'Serve pizza.',
      actions: [{ label: 'Sign up', url: 'https://example.org/signup' }, { label: 'Email', url: 'mailto:coord@example.org' }],
    });
    expect(fam.visibility).toBe('families');
    const pub = await createVolunteer(a.ownerCtx, { title: 'Flowers for Mary', visibility: 'public', sortOrder: 5 });

    expect(await listPublicVolunteer(a.tenant.id, PUBLIC_VIEWER)).toEqual([]);
    await transitionVolunteer(a.ownerCtx, fam.id, 'publish');
    await transitionVolunteer(a.ownerCtx, pub.id, 'publish');
    expect((await listPublicVolunteer(a.tenant.id, PUBLIC_VIEWER)).map((o) => o.title)).toEqual(['Flowers for Mary']);

    const parent = await member(a, 'family');
    const v = await loadViewer(a.tenant.id, parent);
    expect((await listPublicVolunteer(a.tenant.id, v)).map((o) => o.title)).toEqual(['Pizza Fridays', 'Flowers for Mary']);
    // Another school's family sees nothing of school A.
    await expect(listPublicVolunteer(b.tenant.id, v)).rejects.toThrow(/another school/);

    const updated = await updateVolunteer(a.ownerCtx, fam.id, { title: 'Pizza Fridays', visibility: 'families', commitment: '3 volunteers' });
    expect(updated.commitment).toBe('3 volunteers');
    await deleteVolunteer(a.ownerCtx, pub.id);
    expect((await listVolunteerForStaff(a.ownerCtx)).map((o) => o.title)).toEqual(['Pizza Fridays']);
  });

  it('roles: a volunteer coordinator manages them, a teacher cannot', async () => {
    const coord = (await loadAuthzContext(a.tenant.id, await member(a, 'staff', 'volunteer_coordinator')))!;
    const o = await createVolunteer(coord, { title: 'Room parent' });
    await transitionVolunteer(coord, o.id, 'publish');
    const teacher = (await loadAuthzContext(a.tenant.id, await member(a, 'staff', 'teacher')))!;
    await expect(createVolunteer(teacher, { title: 'Nope' })).rejects.toThrow(/volunteer.create/);
  });

  it('imports a file once; a bad item stops the whole import', async () => {
    const file = JSON.stringify({
      source: 'test',
      opportunities: [
        { title: 'Trunk or Treat', category: 'Events', actions: [{ label: 'Email', url: 'mailto:pa@example.org' }], sortOrder: 10 },
        { title: 'Gala Chair', category: 'Events', sortOrder: 20 },
      ],
    });
    expect(await importVolunteer(b.ownerCtx, file, { publish: true })).toEqual({ created: 2, skipped: 0 });
    expect(await importVolunteer(b.ownerCtx, file, { publish: true })).toEqual({ created: 0, skipped: 2 });
    expect((await listPublicVolunteer(b.tenant.id, PUBLIC_VIEWER)).length).toBe(0); // families-only by default
    const bad = JSON.stringify({ opportunities: [{ title: 'Fine' }, { title: 'Evil', actions: [{ label: 'x', url: 'javascript:1' }] }] });
    await expect(importVolunteer(b.ownerCtx, bad)).rejects.toThrow(/Item 2/);
    expect((await listVolunteerForStaff(b.ownerCtx)).map((o) => o.title).sort()).toEqual(['Gala Chair', 'Trunk or Treat']);
    await expect(importVolunteer(b.ownerCtx, '{nope')).rejects.toThrow(/not valid JSON/);
  });
});
