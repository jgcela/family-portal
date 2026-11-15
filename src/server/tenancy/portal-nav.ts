// Family portal navigation, built from what the school has turned on.
// The header works like a one-page portal: the main menu jumps to sections of
// the homepage, and separate pages live in the small bar above it.
import { BLOCK_INFO, type HomepageBlock } from './homepage-defaults';

export type NavLink = { label: string; href: string; newTab?: boolean };
type ModuleNav = { id: string; nav?: { label: string; path: string; area: string } | null };

/** Homepage blocks that actually render: enabled, implemented, module on, and not an empty custom message. */
export function visibleBlocks(blocks: HomepageBlock[], active: ReadonlySet<string>) {
  return blocks.filter((b) => {
    const info = BLOCK_INFO[b.type];
    if (!b.enabled || !info.rendered) return false;
    if (b.type === 'custom-content' && !(typeof b.settings.body === 'string' && b.settings.body.trim())) return false;
    return !info.module || active.has(info.module);
  });
}

/** Link to a section of the homepage. `base` is '' on a custom domain. */
export const homeAnchor = (base: string, id: string) => `${base || '/'}#${id}`;

/**
 * Main menu: This week, Documents, Calendar, Contact. Each one jumps to its
 * homepage section; when that section is not on the homepage, it opens the
 * module's own page instead, and when neither exists it is left out.
 */
export function sectionLinks(blocks: HomepageBlock[], active: ReadonlySet<string>, base: string, hasContact: boolean): NavLink[] {
  const has = (t: HomepageBlock['type']) => blocks.some((b) => b.type === t);
  const out: NavLink[] = [];
  if (has('this-week')) out.push({ label: 'This week', href: homeAnchor(base, 'this-week') });
  if (has('documents')) out.push({ label: 'Documents', href: homeAnchor(base, 'documents') });
  else if (active.has('documents')) out.push({ label: 'Documents', href: `${base}/documents` });
  if (has('upcoming-events')) out.push({ label: 'Calendar', href: homeAnchor(base, 'calendar') });
  else if (active.has('calendar')) out.push({ label: 'Calendar', href: `${base}/calendar` });
  // The footer carries id="contact" on every page.
  if (hasContact) out.push({ label: 'Contact', href: '#contact' });
  return out;
}

/** Every module page a family can open (Home excluded), in registry order. */
export function modulePages(modules: ModuleNav[], base: string): NavLink[] {
  return modules
    .filter((m) => m.nav?.area === 'primary' && m.nav.path !== '/')
    .map((m) => ({ label: m.nav!.label, href: `${base}${m.nav!.path}` }));
}

/**
 * Top bar when the school has not chosen its own links: the module pages that
 * the main menu does not already reach.
 */
export function defaultTopLinks(modules: ModuleNav[], base: string): NavLink[] {
  const inMainMenu = new Set(['/calendar', '/documents']);
  return modulePages(
    modules.filter((m) => !inMainMenu.has(m.nav?.path ?? '')),
    base,
  );
}
