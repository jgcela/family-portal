// School Messenger: HTML cleaning, who sees which issue, permissions, tenancy and re-import.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withTenant } from '@/server/db/client';
import { memberships, membershipRoles, roles } from '@/server/db/schema';
import { loadAuthzContext } from '@/server/rbac/context';
import { loadViewer, PUBLIC_VIEWER } from '@/server/viewer';
import { sanitizeEmailHtml } from '@/server/content/email-html';
import { deleteIssue, getIssueForStaff, getPublicIssue, listIssuesForStaff, listPublicIssues, saveIssue, updateIssueDetails } from '@/server/services/messenger';
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

const EMAIL = `<html><head><title>Messenger</title><style>.x{color:red}</style><script>alert(1)</script></head>
<body onload="steal()"><table><tr><td><p class="x" style="color:#16335b">Hello <a href="https://example.org/page" onclick="x()">read</a>
<a href="javascript:alert(1)">bad</a> <a href="mailto:office@example.org">mail</a></p>
<img src="https://cdn.example.org/a.png" alt="photo"><img src="http://cdn.example.org/b.png"><img src="https://email-mg.flocknote.com/o/abc">
<iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="p"></form>
<div id="footer1_around"><div>Sent by School Communications <a href="https://x/unsubscribe">unsubscribe</a></div></div>
</td></tr></table><script>parent.postMessage(1,'*')</script></body></html>`;

beforeAll(async () => {
  a = await createSchool('msg-a');
  b = await createSchool('msg-b');
});
afterAll(async () => {
  await closeDb();
});

describe('newsletter HTML cleaning', () => {
  it('removes scripts, handlers, frames, forms, trackers and the email footer; keeps layout and safe links', () => {
    const out = sanitizeEmailHtml(EMAIL);
    expect(out).not.toMatch(/<script|alert\(|onload|onclick|<iframe|<form|<input|javascript:/i);
    expect(out).not.toMatch(/email-mg\.flocknote|unsubscribe|Sent by School/);
    expect(out).not.toContain('http://cdn.example.org/b.png');
    expect(out).toContain('<img src="https://cdn.example.org/a.png" alt="photo" />');
    expect(out).toContain('style="color:#16335b"');
    expect(out).toContain('<style>.x{color:red}</style>');
    expect(out).toMatch(/<a href="https:\/\/example.org\/page" target="_blank" rel="noopener noreferrer">read<\/a>/);
    expect(out).toContain('href="mailto:office@example.org"');
  });
});

describe('school messenger', () => {
  it('stores cleaned HTML, replaces an issue with the same date, and checks dates', async () => {
    const first = await saveIssue(a.ownerCtx, { issueDate: '2026-11-09', title: 'Week 1', html: EMAIL, highlights: ['Nov 13 — Mass'] });
    expect(first.created).toBe(true);
    const again = await saveIssue(a.ownerCtx, { issueDate: '2026-11-09', title: 'Week 1 (fixed)', html: '<p>Hi</p>' });
    expect(again).toEqual({ id: first.id, created: false });
    expect((await listIssuesForStaff(a.ownerCtx)).map((i) => i.title)).toEqual(['Week 1 (fixed)']);
    await expect(saveIssue(a.ownerCtx, { issueDate: '2026-02-30x', title: 'X', html: '<p>x</p>' })).rejects.toThrow(/2026-11-09/);
    await expect(saveIssue(a.ownerCtx, { issueDate: '2026-11-10', title: 'X', html: '<script>only()</script>' })).rejects.toThrow(/Nothing was left/);
  });

  it('shows each issue only to the people it is for', async () => {
    const fam = await saveIssue(a.ownerCtx, { issueDate: '2026-11-02', title: 'Families only', html: '<p>f</p>', visibility: 'families' });
    const hidden = await saveIssue(a.ownerCtx, { issueDate: '2026-10-26', title: 'Hidden', html: '<p>h</p>', isActive: false });
    const pub = (await listPublicIssues(a.tenant.id, PUBLIC_VIEWER)).map((i) => i.title);
    expect(pub).toEqual(['Week 1 (fixed)']);
    expect(await getPublicIssue(a.tenant.id, fam.id, PUBLIC_VIEWER)).toBeNull();
    expect(await getPublicIssue(a.tenant.id, hidden.id, PUBLIC_VIEWER)).toBeNull();

    const parent = await loadViewer(a.tenant.id, await member(a, 'family'));
    expect((await listPublicIssues(a.tenant.id, parent)).map((i) => i.title)).toEqual(['Week 1 (fixed)', 'Families only']);
    expect((await getPublicIssue(a.tenant.id, fam.id, parent))?.html).toBe('<p>f</p>');
    // The list never carries the HTML.
    expect('html' in (await listPublicIssues(a.tenant.id, parent))[0]!).toBe(false);
    // Other schools see nothing, even with the id.
    expect(await listPublicIssues(b.tenant.id, PUBLIC_VIEWER)).toEqual([]);
  });

  it('needs announcement permissions and stays inside the school', async () => {
    const teacher = (await loadAuthzContext(a.tenant.id, await member(a, 'staff', 'teacher')))!;
    await expect(deleteIssue(teacher, (await listIssuesForStaff(a.ownerCtx))[0]!.id)).rejects.toThrow(/announcements.delete/);
    const [mine] = await listIssuesForStaff(a.ownerCtx);
    await expect(getIssueForStaff(b.ownerCtx, mine!.id)).rejects.toThrow(/not found/);
    await expect(updateIssueDetails(b.ownerCtx, mine!.id, { title: 'Hijack' })).rejects.toThrow(/not found/);
    await expect(deleteIssue(b.ownerCtx, mine!.id)).rejects.toThrow(/not found/);
    const edited = await updateIssueDetails(a.ownerCtx, mine!.id, { title: 'Renamed', highlights: ['A', 'B'], visibility: 'families', isActive: true });
    expect(edited.title).toBe('Renamed');
    expect(edited.visibility).toBe('families');
    await deleteIssue(a.ownerCtx, mine!.id);
    await expect(getIssueForStaff(a.ownerCtx, mine!.id)).rejects.toThrow(/not found/);
  });
});
