// Platform metrics come from real rows; only platform owners manage the platform team.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb } from '@/server/db/client';
import { platformAdmins, subscriptions, user } from '@/server/db/schema';
import { loadPlatformContext, type PlatformContext } from '@/server/services/platform';
import { addPlatformMember, getPlatformHealth, listPlatformTeam, removePlatformMember, setPlatformRole } from '@/server/services/platform-ops';
import { addDomain } from '@/server/services/domains';
import { createSchool, createUser } from './helpers';

let owner: PlatformContext;
let operator: PlatformContext;
let school: Awaited<ReturnType<typeof createSchool>>;

async function member(role: 'owner' | 'operator' | 'support') {
  const id = await createUser(`P ${role}`);
  await platformDb().insert(platformAdmins).values({ userId: id, role });
  return (await loadPlatformContext(id))!;
}

beforeAll(async () => {
  owner = await member('owner');
  operator = await member('operator');
  school = await createSchool('ops');
});
afterAll(async () => {
  await closeDb();
});

describe('platform health', () => {
  it('reports trials ending soon, past-due schools and domains waiting for DNS', async () => {
    await platformDb()
      .update(subscriptions)
      .set({ status: 'trialing', trialEndsAt: new Date(Date.now() + 3 * 86400_000) })
      .where(eq(subscriptions.tenantId, school.tenant.id));
    await addDomain(school.ownerCtx, `ops-${Date.now()}.example-school.org`);
    const h = await getPlatformHealth(operator);
    expect(h.trialsEnding.some((t) => t.id === school.tenant.id)).toBe(true);
    expect(h.domainsWaiting.some((d) => d.tenantId === school.tenant.id)).toBe(true);
    expect(h.schools.active).toBeGreaterThan(0);
    await expect(getPlatformHealth({ ...owner })).rejects.toThrow(/Unverified/);
  });
});

describe('platform team', () => {
  it('owners add, change and remove members; the last owner stays', async () => {
    const id = await createUser('New Teammate');
    const [u] = await platformDb().select().from(user).where(eq(user.id, id));
    await expect(addPlatformMember(operator, u!.email, 'support')).rejects.toThrow(/Only platform owners/);
    await expect(addPlatformMember(owner, 'nobody@nowhere.test', 'support')).rejects.toThrow(/No account/);
    await addPlatformMember(owner, u!.email, 'support');
    await expect(addPlatformMember(owner, u!.email, 'support')).rejects.toThrow(/already/);
    expect((await listPlatformTeam(owner)).find((m) => m.userId === id)?.role).toBe('support');
    await setPlatformRole(owner, id, 'operator');
    await expect(setPlatformRole(owner, owner.userId, 'support')).rejects.toThrow(/own role/);
    await expect(removePlatformMember(owner, owner.userId)).rejects.toThrow(/yourself/);
    await removePlatformMember(owner, id);
    expect(await loadPlatformContext(id)).toBeNull();
  });
});
