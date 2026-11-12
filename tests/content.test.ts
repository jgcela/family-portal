// Announcements, pages and safe Markdown, end to end against PostgreSQL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, platformDb, withTenant } from '@/server/db/client';
import { announcements, audiences, membershipRoles, memberships, pages, pageVersions, roles, tenantSettings } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import {
  createAnnouncement,
  createPage,
  getPublicAnnouncement,
  getPublishedPage,
  listAnnouncementsForStaff,
  listPublicAnnouncements,
  restorePageVersion,
  transitionAnnouncement,
  transitionPage,
  updateAnnouncement,
  updatePage,
} from '@/server/services/content';
import { renderMarkdown } from '@/server/content/markdown';
import { createSchool, createUser, expectDbError } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;
let grade5: string;

async function addMember(tenantId: string, roleKey: string, scope?: { scopeType: 'audience'; scopeId: string }) {
  const userId = await createUser(`member-${roleKey}`);
  await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
    await tx.insert(membershipRoles).values({
      tenantId,
      membershipId: m!.id,
      roleId: r!.id,
      scopeType: scope?.scopeType ?? 'school',
      scopeId: scope?.scopeId ?? null,
    });
  });
  return { userId, ctx: (await loadAuthzContext(tenantId, userId))! };
}

beforeAll(async () => {
  a = await createSchool('content-a');
  b = await createSchool('content-b');
  grade5 = await withTenant(a.tenant.id, async (tx) => (await tx.select().from(audiences).where(eq(audiences.key, 'grade-5')))[0]!.id);
});

afterAll(async () => {
  await closeDb();
});

describe('safe Markdown', () => {
  it('never renders raw HTML, scripts or javascript: links', () => {
    const { html } = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) [y](data:text/html,hi) ![i](javascript:1)\n\n<style>body{display:none}</style>',
    );
    expect(html).not.toMatch(/<script|<img src=x|<style|href="javascript|href="data/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps safe links, opens external ones safely, and builds a table of contents', () => {
    const { html, toc } = renderMarkdown('# Arrival\n\nSee [policy](https://example.test/p) or [office](mailto:o@x.test).\n\n## Drop-off\n\n## Drop-off\n');
    expect(html).toContain('<h2 id="arrival">');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:o@x.test"');
    expect(toc.map((t) => t.id)).toEqual(['arrival', 'drop-off', 'drop-off-2']);
  });
});

describe('announcements', () => {
  it('are isolated per school by RLS', async () => {
    const ann = await createAnnouncement(a.ownerCtx, { title: 'Picture day', body: 'Smile!' });
    expect(await withTenant(b.tenant.id, (tx) => tx.select().from(announcements).where(eq(announcements.id, ann.id)))).toEqual([]);
    await expectDbError(
      withTenant(a.tenant.id, (tx) => tx.insert(announcements).values({ tenantId: b.tenant.id, title: 'x' })),
      /row-level security/,
    );
  });

  it('families only see published, started and unexpired announcements, urgent first', async () => {
    const now = new Date('2026-11-12T18:00:00Z');
    const mk = async (title: string, extra: Record<string, unknown> = {}) => {
      const x = await createAnnouncement(b.ownerCtx, { title, ...extra });
      await transitionAnnouncement(b.ownerCtx, x.id, 'publish');
      return x;
    };
    await mk('Normal');
    await mk('Urgent closure', { isUrgent: true });
    await mk('Later', { publishAt: '2026-12-01T00:00:00Z' });
    await mk('Expired', { expiresAt: '2026-11-01T00:00:00Z' });
    await createAnnouncement(b.ownerCtx, { title: 'Draft' });
    const list = await listPublicAnnouncements(b.tenant.id, { now });
    expect(list.map((x) => x.title)).toEqual(['Urgent closure', 'Normal']);
    const later = (await withTenant(b.tenant.id, (tx) => tx.select().from(announcements).where(eq(announcements.title, 'Later'))))[0]!;
    expect(await getPublicAnnouncement(b.tenant.id, later.id, now)).toBeNull();
    expect(await getPublicAnnouncement(b.tenant.id, later.id, new Date('2026-12-02T00:00:00Z'))).not.toBeNull();
  });

  it('rejects an end before the start', async () => {
    await expect(
      createAnnouncement(a.ownerCtx, { title: 'x', publishAt: '2026-12-02T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z' }),
    ).rejects.toThrow(/after the start/);
  });

  it('grade-scoped teachers post only to their grade and cannot publish', async () => {
    const t = await addMember(a.tenant.id, 'teacher', { scopeType: 'audience', scopeId: grade5 });
    const mine = await createAnnouncement(t.ctx, { title: '5th grade field trip', audienceIds: [grade5] });
    await expect(createAnnouncement(t.ctx, { title: 'All school' })).rejects.toThrow(/announcements.create/);
    await expect(updateAnnouncement(t.ctx, mine.id, { title: 'Now for all' })).rejects.toThrow(/announcements.edit/);
    await expect(transitionAnnouncement(t.ctx, mine.id, 'publish')).rejects.toThrow(/announcements.publish/);
    const visible = await listAnnouncementsForStaff(t.ctx);
    expect(visible.every((x) => x.audienceIds.includes(grade5))).toBe(true);
  });

  it('follows approval with separation of duties when the school requires it', async () => {
    await platformDb().update(tenantSettings).set({ requireApproval: true }).where(eq(tenantSettings.tenantId, a.tenant.id));
    const comms = await addMember(a.tenant.id, 'communications_manager');
    const x = await createAnnouncement(comms.ctx, { title: 'Needs approval' });
    await expect(transitionAnnouncement(comms.ctx, x.id, 'publish')).rejects.toThrow(/requires approval/);
    await transitionAnnouncement(comms.ctx, x.id, 'submit');
    await expect(transitionAnnouncement(comms.ctx, x.id, 'approve')).rejects.toThrow(/Someone else/);
    await transitionAnnouncement(a.ownerCtx, x.id, 'approve');
    const pub = await transitionAnnouncement(comms.ctx, x.id, 'publish');
    expect(pub.status).toBe('published');
    expect(pub.publishedAt).toBeInstanceOf(Date);
    await platformDb().update(tenantSettings).set({ requireApproval: false }).where(eq(tenantSettings.tenantId, a.tenant.id));
  });
});

describe('pages', () => {
  it('families see the published snapshot, not later edits, until republished', async () => {
    const p = await createPage(a.ownerCtx, { slug: 'supply-list', title: 'Supply List', body: 'v1 text' });
    expect(await getPublishedPage(a.tenant.id, 'supply-list')).toBeNull();
    await transitionPage(a.ownerCtx, p.id, 'publish');
    expect((await getPublishedPage(a.tenant.id, 'supply-list'))!.version.body).toBe('v1 text');

    const edited = await updatePage(a.ownerCtx, p.id, { slug: 'supply-list', title: 'Supply List', body: 'v2 text' });
    expect(edited.status).toBe('draft');
    expect((await getPublishedPage(a.tenant.id, 'supply-list'))!.version.body).toBe('v1 text');

    await transitionPage(a.ownerCtx, p.id, 'publish');
    const live = await getPublishedPage(a.tenant.id, 'supply-list');
    expect(live!.version).toMatchObject({ body: 'v2 text', version: 2 });

    // Restore v1 into the working copy; live stays v2 until published.
    const v1 = (await withTenant(a.tenant.id, (tx) => tx.select().from(pageVersions).where(eq(pageVersions.version, 1))))[0]!;
    const restored = await restorePageVersion(a.ownerCtx, p.id, v1.id);
    expect(restored.body).toBe('v1 text');
    expect((await getPublishedPage(a.tenant.id, 'supply-list'))!.version.body).toBe('v2 text');

    await transitionPage(a.ownerCtx, p.id, 'unpublish');
    expect(await getPublishedPage(a.tenant.id, 'supply-list')).toBeNull();
  });

  it('published versions cannot be rewritten, even with direct SQL in the tenant context', async () => {
    await expectDbError(
      withTenant(a.tenant.id, (tx) => tx.update(pageVersions).set({ body: 'tampered' })),
      /permission denied/,
    );
  });

  it('page addresses are unique per school and reserved words are refused', async () => {
    await createPage(a.ownerCtx, { slug: 'handbook', title: 'Handbook' });
    await expect(createPage(a.ownerCtx, { slug: 'handbook', title: 'Again' })).rejects.toThrow(/already uses/);
    await expect(createPage(a.ownerCtx, { slug: 'admin', title: 'Nope' })).rejects.toThrow(/reserved/);
    await createPage(b.ownerCtx, { slug: 'handbook', title: 'Other school' });
    expect(await withTenant(b.tenant.id, (tx) => tx.select().from(pages))).toHaveLength(1);
  });

  it('teachers cannot publish pages', async () => {
    const t = await addMember(a.tenant.id, 'content_editor');
    const p = await createPage(t.ctx, { slug: 'editor-page', title: 'Editor page' });
    await expect(transitionPage(t.ctx, p.id, 'publish')).rejects.toThrow(/pages.publish/);
  });
});

describe('Markdown heading levels', () => {
  it('shifts levels when the source uses # so sub-sections nest in the contents', () => {
    const { html, toc } = renderMarkdown('# A\n\n## B\n\n# C');
    expect(html).toContain('<h3 id="b">');
    expect(toc.map((t) => `${t.level}${t.id}`)).toEqual(['2a', '3b', '2c']);
    expect(renderMarkdown('## Only h2').html).toContain('<h2 id="only-h2">');
  });
});
