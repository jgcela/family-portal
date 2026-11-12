// Safe rendering of admin-written content. Markdown only: raw HTML in the
// source is shown as text (html: false), and links/images are limited to
// http(s), mailto, tel and site-relative URLs. No admin can inject script or CSS.
import MarkdownIt from 'markdown-it';

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  );
}

function createMd() {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false });
  md.validateLink = (url) => SAFE_URL.test(url.trim());

  // External links open in a new tab without leaking the opener.
  const defaultLinkOpen = md.renderer.rules.link_open ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx]!.attrGet('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      tokens[idx]!.attrSet('target', '_blank');
      tokens[idx]!.attrSet('rel', 'noopener noreferrer');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx]!.attrSet('loading', 'lazy');
    return self.renderToken(tokens, idx, options);
  };
  // Tables scroll sideways on phones instead of breaking the layout.
  md.renderer.rules.table_open = () => '<div class="table-scroll"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';
  return md;
}

const md = createMd();

export type TocEntry = { id: string; text: string; level: 2 | 3 };

/**
 * Renders Markdown to HTML. Headings are demoted when the source uses h1 (the
 * page title is the only h1). h2/h3 get stable ids for the table of contents.
 */
export function renderMarkdown(src: string): { html: string; toc: TocEntry[] } {
  const tokens = md.parse(src ?? '', {});
  const toc: TocEntry[] = [];
  const used = new Map<string, number>();
  // The page title is the only h1: if the source uses "#" headings, shift every level down one.
  const shift = tokens.some((t) => t.type === 'heading_open' && t.tag === 'h1');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== 'heading_open' && t.type !== 'heading_close') continue;
    if (shift) t.tag = `h${Math.min(Number(t.tag.slice(1)) + 1, 6)}`;
    if (t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3')) {
      const text = tokens[i + 1]?.children?.map((c) => c.content).join('') ?? '';
      const base = slugify(text);
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      const id = n ? `${base}-${n + 1}` : base;
      t.attrSet('id', id);
      toc.push({ id, text, level: t.tag === 'h2' ? 2 : 3 });
    }
  }
  return { html: md.renderer.render(tokens, md.options, {}), toc };
}

/** Plain-text excerpt for cards and previews. */
export function excerpt(src: string, max = 220): string {
  const text = (src ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
}
