import { describe, expect, it } from 'vitest';
import { defaultTopLinks, homeAnchor, modulePages, sectionLinks, visibleBlocks } from '@/server/tenancy/portal-nav';
import type { HomepageBlock } from '@/server/tenancy/homepage-defaults';

const block = (type: HomepageBlock['type'], extra: Partial<HomepageBlock> = {}): HomepageBlock =>
  ({ id: type, type, title: null, enabled: true, audienceKeys: [], settings: {}, ...extra }) as HomepageBlock;
const mods = [
  { id: 'home', nav: { label: 'Home', path: '/', area: 'primary' } },
  { id: 'calendar', nav: { label: 'Calendar', path: '/calendar', area: 'primary' } },
  { id: 'documents', nav: { label: 'Documents', path: '/documents', area: 'primary' } },
  { id: 'volunteer', nav: { label: 'Volunteer', path: '/volunteer', area: 'primary' } },
  { id: 'messenger', nav: { label: 'School Messenger', path: '/messenger', area: 'secondary' } },
  { id: 'quick_links' },
];

describe('portal navigation', () => {
  it('jumps to homepage sections like the original one-page portal', () => {
    const active = new Set(['calendar', 'documents']);
    const blocks = visibleBlocks([block('this-week'), block('documents'), block('upcoming-events')], active);
    expect(sectionLinks(blocks, active, '/s/stmary', true)).toEqual([
      { label: 'This week', href: '/s/stmary#this-week' },
      { label: 'Documents', href: '/s/stmary#documents' },
      { label: 'Calendar', href: '/s/stmary#calendar' },
      { label: 'Contact', href: '#contact' },
    ]);
  });

  it('opens the module page when its section is not on the homepage, and drops what is off', () => {
    const active = new Set(['calendar', 'documents']);
    expect(sectionLinks([], active, '', false)).toEqual([
      { label: 'Documents', href: '/documents' },
      { label: 'Calendar', href: '/calendar' },
    ]);
    expect(sectionLinks([], new Set(), '', false)).toEqual([]);
  });

  it('ignores disabled blocks and blocks whose module is off', () => {
    const blocks = visibleBlocks([block('this-week', { enabled: false }), block('documents')], new Set(['calendar']));
    expect(blocks).toEqual([]);
  });

  it('home anchors work on a custom domain', () => {
    expect(homeAnchor('', 'documents')).toBe('/#documents');
  });

  it('top bar falls back to module pages the main menu does not reach', () => {
    expect(defaultTopLinks(mods, '/s/x')).toEqual([{ label: 'Volunteer', href: '/s/x/volunteer' }]);
    expect(modulePages(mods, '').map((l) => l.href)).toEqual(['/calendar', '/documents', '/volunteer']);
  });
});
