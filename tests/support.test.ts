// Platform support access: requested by the platform, approved by the school,
// read-only, time-limited, revocable and logged.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { auditLogs, membershipRoles, memberships, platformAdmins, roles, supportGrants } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { can, hasAnywhere } from '@/server/rbac/authorize';
import { loadPlatformContext, type PlatformContext } from '@/server/services/platform';
import {
  approveSupportGrant,
  declineSupportGrant,
  endMySupportAccess,
  listMySupportGrants,
  listSupportGrants,
  requestSupportAccess,
  revokeSupportGrant,
  supportPermissions,
} from '@/server/services/support';
import { createAnnouncement } from '@/server/services/content';
import { listStaff } from '@/server/services/staff';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;
let agent: PlatformContext;
let agentId: string;

beforeAll(async () => {
  a = await createSchool('sup-a');
  b = await createSchool('sup-b');
  agentId = await createUser('Support Agent');
  await platformDb().insert(platformAdmins).values({ userId: agentId, role: 'support' });
  agent = (await loadPlatformContext(agentId))!;
});
afterAll(async () => {
  await closeDb();
});

describe('support grants', () => {
  it('give only view permissions, and people data only when asked for', () => {
    const content = supportPermissions(['content']);
    expect(content).toContain('dashboard.view');
    expect(content).toContain('announcements.view');
    expect(content).not.toContain('users.view');
    expect(content.every((p) => p.endsWith('.view'))).toBe(true);
    expect(supportPermissions(['people'])).toEqual(expect.arrayContaining(['users.view', 'roles.view']));
  });

  it('nothing works before the school approves; then read-only access until revoked', async () => {
    expect(await loadAuthzContext(a.tenant.id, agentId)).toBeNull();
    await expect(requestSupportAccess(agent, a.tenant.id, { reason: 'short', scopes: ['content'], hours: 8 })).rejects.toThrow(/at least 10/);
    await expect(requestSupportAccess(agent, a.tenant.id, { reason: 'Calendar import fails', scopes: [], hours: 8 })).rejects.toThrow(/one area/);
    await expect(requestSupportAccess(agent, a.tenant.id, { reason: 'Calendar import fails', scopes: ['content'], hours: 5 })).rejects.toThrow(/how long/);
    const g = await requestSupportAccess(agent, a.tenant.id, { reason: 'Calendar import fails for the office', scopes: ['content'], hours: 8 });
    await expect(requestSupportAccess(agent, a.tenant.id, { reason: 'Second request here', scopes: ['content'], hours: 8 })).rejects.toThrow(/already have/);
    expect(await loadAuthzContext(a.tenant.id, agentId)).toBeNull();

    // Another school cannot see or approve it.
    expect((await listSupportGrants(b.ownerCtx)).map((x) => x.id)).not.toContain(g.id);
    await expect(approveSupportGrant(b.ownerCtx, g.id)).rejects.toThrow(/not found/);

    const list = await listSupportGrants(a.ownerCtx);
    const row = list.find((x) => x.id === g.id)!;
    expect(row.state).toBe('pending');
    expect(row.requester?.name).toBe('Support Agent');

    await approveSupportGrant(a.ownerCtx, g.id);
    const ctx = (await loadAuthzContext(a.tenant.id, agentId))!;
    expect(ctx.support?.grantId).toBe(g.id);
    expect(hasAnywhere(ctx, 'dashboard.view')).toBe(true);
    expect(can(ctx, 'announcements.view')).toBe(true);
    expect(can(ctx, 'announcements.create')).toBe(false);
    expect(can(ctx, 'users.view')).toBe(false);
    // Writes are refused by the services, not only hidden.
    await expect(createAnnouncement(ctx, { title: 'From support' })).rejects.toThrow();
    await expect(listStaff(ctx)).rejects.toThrow();
    // A support session can't approve support access.
    await expect(listSupportGrants(ctx)).rejects.toThrow(/Support sessions/);
    // It does not carry over to another school.
    expect(await loadAuthzContext(b.tenant.id, agentId)).toBeNull();

    // First use is logged once.
    await loadAuthzContext(a.tenant.id, agentId);
    const starts = await withTenant(a.tenant.id, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.action, 'support.session_started')));
    expect(starts.filter((x) => x.targetId === g.id)).toHaveLength(1);

    await revokeSupportGrant(a.ownerCtx, g.id);
    expect(await loadAuthzContext(a.tenant.id, agentId)).toBeNull();
    expect((await listMySupportGrants(agent, a.tenant.id))[0]!.state).toBe('revoked');
  });

  it('expired, declined and ended access gives nothing; only owners decide', async () => {
    const g = await requestSupportAccess(agent, b.tenant.id, { reason: 'Look at the homepage layout', scopes: ['content', 'people'], hours: 2 });
    // A staff member without support.grant cannot approve.
    const editorId = await createUser('Editor');
    await withTenant(b.tenant.id, async (tx) => {
      const [m] = await tx.insert(memberships).values({ tenantId: b.tenant.id, userId: editorId, kind: 'staff', status: 'active' }).returning();
      const [r] = await tx.select().from(roles).where(eq(roles.key, 'school_admin'));
      await tx.insert(membershipRoles).values({ tenantId: b.tenant.id, membershipId: m!.id, roleId: r!.id, scopeType: 'school' });
    });
    const editor = (await loadAuthzContext(b.tenant.id, editorId))!;
    await expect(approveSupportGrant(editor, g.id)).rejects.toThrow(/School Owner/);

    await declineSupportGrant(b.ownerCtx, g.id);
    expect(await loadAuthzContext(b.tenant.id, agentId)).toBeNull();
    await expect(approveSupportGrant(b.ownerCtx, g.id)).rejects.toThrow(/already answered/);

    const g2 = await requestSupportAccess(agent, b.tenant.id, { reason: 'Look at the homepage layout', scopes: ['people'], hours: 2 });
    await approveSupportGrant(b.ownerCtx, g2.id);
    const ctx = (await loadAuthzContext(b.tenant.id, agentId))!;
    expect(can(ctx, 'users.view')).toBe(true);
    expect(can(ctx, 'announcements.view')).toBe(false);
    await endMySupportAccess(agent, g2.id);
    expect(await loadAuthzContext(b.tenant.id, agentId)).toBeNull();

    const g3 = await requestSupportAccess(agent, b.tenant.id, { reason: 'Look at the homepage layout', scopes: ['content'], hours: 2 });
    await approveSupportGrant(b.ownerCtx, g3.id);
    await platformDb().update(supportGrants).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(supportGrants.id, g3.id));
    expect(await loadAuthzContext(b.tenant.id, agentId)).toBeNull();
    await expect(revokeSupportGrant(b.ownerCtx, g3.id)).rejects.toThrow(/not active/);
  });
});
