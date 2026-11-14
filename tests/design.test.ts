// Theme editor and homepage builder: drafts, publishing, history, permissions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { homepageVersions, membershipRoles, memberships, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import {
  discardHomepageDraft,
  getHomepageDraftBlocks,
  getHomepageEditorState,
  publishHomepageDraft,
  restoreHomepageVersion,
  saveHomepageDraft,
} from '@/server/services/homepage';
import {
  discardThemeDraft,
  getPublishedTheme,
  getThemeDraftTokens,
  getThemeEditorState,
  publishThemeDraft,
  restoreThemeVersion,
  saveThemeDraft,
} from '@/server/services/theme';
import { DEFAULT_HOMEPAGE, validateHomepage, type HomepageBlock } from '@/server/tenancy/homepage-defaults';
import { DEFAULT_THEME } from '@/server/theme/tokens';
import { createSchool, createUser } from './helpers';

let a: Awaited<ReturnType<typeof createSchool>>;
let b: Awaited<ReturnType<typeof createSchool>>;

async function addMember(tenantId: string, roleKey: string) {
  const userId = await createUser(`member-${roleKey}`);
  await withTenant(tenantId, async (tx) => {
    const [m] = await tx.insert(memberships).values({ tenantId, userId, kind: 'staff', status: 'active' }).returning();
    const [r] = await tx.select().from(roles).where(eq(roles.key, roleKey));
    await tx.insert(membershipRoles).values({ tenantId, membershipId: m!.id, roleId: r!.id, scopeType: 'school', scopeId: null });
  });
  return (await loadAuthzContext(tenantId, userId))!;
}

/** What families see: the published layout. */
async function getPortalViewUncached(tenantId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(homepageVersions)
      .where(and(eq(homepageVersions.tenantId, tenantId), eq(homepageVersions.status, 'published'))),
  );
  return { homepage: row!.blocks as HomepageBlock[] };
}

beforeAll(async () => {
  a = await createSchool('design-a');
  b = await createSchool('design-b');
});
afterAll(async () => {
  await closeDb();
});

const custom = (body: string, id = 'custom-content-2'): HomepageBlock => ({
  id,
  type: 'custom-content',
  title: 'A note',
  enabled: true,
  audienceKeys: [],
  settings: { body },
});

describe('homepage validation', () => {
  it('accepts the default layout', () => {
    expect(validateHomepage(DEFAULT_HOMEPAGE).ok).toBe(true);
  });

  it('rejects duplicate ids, two welcome banners, bad settings and unknown keys', () => {
    const dupe = validateHomepage([DEFAULT_HOMEPAGE[0], DEFAULT_HOMEPAGE[0]]);
    expect(dupe.ok).toBe(false);
    expect(!dupe.ok && dupe.errors.join(' ')).toMatch(/share the id/);
    expect(!dupe.ok && dupe.errors.join(' ')).toMatch(/one welcome/);

    const range = validateHomepage([{ id: 'w', type: 'this-week', enabled: true, settings: { days: 99 } }]);
    expect(range.ok).toBe(false);

    const extra = validateHomepage([{ id: 'u', type: 'school-updates', enabled: true, settings: { limit: 3, html: '<b>' } }]);
    expect(extra.ok).toBe(false);

    const unknownType = validateHomepage([{ id: 'x', type: 'iframe', enabled: true }]);
    expect(unknownType.ok).toBe(false);

    const longBody = validateHomepage([custom('x'.repeat(5001))]);
    expect(longBody.ok).toBe(false);

    expect(validateHomepage([{ id: 'a', type: 'calendar-alert', enabled: true, settings: { category: 'No school', days: 14 } }]).ok).toBe(true);
    expect(validateHomepage([{ id: 'a', type: 'calendar-alert', enabled: true, settings: { days: 90 } }]).ok).toBe(false);
    expect(validateHomepage([{ id: 'a', type: 'calendar-alert', enabled: true, settings: { color: 'red' } }]).ok).toBe(false);
  });

  it('keeps settings of blocks that are not editable yet, within a size limit', () => {
    const ok = validateHomepage([{ id: 'q', type: 'featured-resources', enabled: true, settings: { links: ['a'] } }]);
    expect(ok.ok && ok.blocks[0]!.settings).toEqual({ links: ['a'] });
    const big = validateHomepage([{ id: 'q', type: 'featured-resources', enabled: true, settings: { blob: 'x'.repeat(3000) } }]);
    expect(big.ok).toBe(false);
  });
});

describe('homepage builder', () => {
  it('drafts do not change what families see until published', async () => {
    const layout = [custom('Hello **families**'), ...DEFAULT_HOMEPAGE.filter((x) => x.type !== 'quick-access')];
    await saveHomepageDraft(a.ownerCtx, layout);
    expect((await getPortalViewUncached(a.tenant.id)).homepage.map((x) => x.id)).toEqual(DEFAULT_HOMEPAGE.map((x) => x.id));
    expect((await getHomepageDraftBlocks(a.tenant.id))?.[0]?.id).toBe('custom-content-2');

    await publishHomepageDraft(a.ownerCtx);
    const live = (await getPortalViewUncached(a.tenant.id)).homepage;
    expect(live[0]!.settings).toEqual({ body: 'Hello **families**' });
    expect(await getHomepageDraftBlocks(a.tenant.id)).toBeNull();

    const state = await getHomepageEditorState(a.ownerCtx);
    expect(state.draft).toBeNull();
    expect(state.history).toHaveLength(1);
    // School B is untouched.
    expect((await getPortalViewUncached(b.tenant.id)).homepage.map((x) => x.id)).toEqual(DEFAULT_HOMEPAGE.map((x) => x.id));
  });

  it('restores an earlier layout as a draft and can discard it', async () => {
    const { history } = await getHomepageEditorState(a.ownerCtx);
    await restoreHomepageVersion(a.ownerCtx, history[0]!.id);
    expect((await getHomepageDraftBlocks(a.tenant.id))?.map((x) => x.id)).toEqual(DEFAULT_HOMEPAGE.map((x) => x.id));
    await discardHomepageDraft(a.ownerCtx);
    expect(await getHomepageDraftBlocks(a.tenant.id)).toBeNull();
    await expect(publishHomepageDraft(a.ownerCtx)).rejects.toThrow(/no draft/);
  });

  it('rejects invalid layouts and another school’s versions', async () => {
    await expect(saveHomepageDraft(a.ownerCtx, [{ id: 'x', type: 'this-week', enabled: true, settings: { days: 0 } }])).rejects.toThrow();
    const { history } = await getHomepageEditorState(a.ownerCtx);
    await expect(restoreHomepageVersion(b.ownerCtx, history[0]!.id)).rejects.toThrow(/no longer exists/);
  });

  it('enforces edit and publish permissions', async () => {
    const teacher = await addMember(a.tenant.id, 'teacher');
    await expect(saveHomepageDraft(teacher, DEFAULT_HOMEPAGE)).rejects.toThrow(/Not allowed/);
    await expect(getHomepageEditorState(teacher)).rejects.toThrow(/Not allowed/);
    const comms = await addMember(a.tenant.id, 'communications_manager');
    await saveHomepageDraft(comms, DEFAULT_HOMEPAGE);
    await publishHomepageDraft(comms);
    const editor = await addMember(a.tenant.id, 'content_editor');
    await expect(publishHomepageDraft(editor)).rejects.toThrow(/Not allowed/);
  });
});

describe('theme editor', () => {
  it('shows the draft separately, restores history and discards drafts', async () => {
    const red = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, primary: '#8B1E1E' } };
    await saveThemeDraft(a.ownerCtx, red);
    expect((await getThemeDraftTokens(a.tenant.id))?.colors.primary).toBe('#8B1E1E');
    expect((await getPublishedTheme(a.tenant.id)).colors.primary).toBe(DEFAULT_THEME.colors.primary);
    await publishThemeDraft(a.ownerCtx);
    expect((await getPublishedTheme(a.tenant.id)).colors.primary).toBe('#8B1E1E');

    const state = await getThemeEditorState(a.ownerCtx);
    expect(state.history[0]!.tokens.colors.primary).toBe(DEFAULT_THEME.colors.primary);
    await restoreThemeVersion(a.ownerCtx, state.history[0]!.id);
    expect((await getThemeDraftTokens(a.tenant.id))?.colors.primary).toBe(DEFAULT_THEME.colors.primary);
    // Restoring only drafts: families still see the red theme.
    expect((await getPublishedTheme(a.tenant.id)).colors.primary).toBe('#8B1E1E');
    await discardThemeDraft(a.ownerCtx);
    expect(await getThemeDraftTokens(a.tenant.id)).toBeNull();
  });

  it('cannot restore another school’s theme or edit without permission', async () => {
    const { history } = await getThemeEditorState(a.ownerCtx);
    await expect(restoreThemeVersion(b.ownerCtx, history[0]!.id)).rejects.toThrow(/no longer exists/);
    const teacher = await addMember(a.tenant.id, 'teacher');
    await expect(getThemeEditorState(teacher)).rejects.toThrow(/Not allowed/);
    await expect(discardThemeDraft(teacher)).rejects.toThrow(/Not allowed/);
  });
});
