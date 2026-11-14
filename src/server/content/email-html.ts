// Cleans newsletter HTML (for example an email exported from Flocknote) before
// it is stored. The result is only ever shown inside a frame whose page forbids
// scripts (see the messenger "raw" route), so this is the first of two layers:
// - no scripts, frames, forms, objects or <base>/<meta>/<link> tags;
// - no event-handler attributes (onclick, onload…);
// - links only to http(s), mailto and tel, and they open in a new tab;
// - images only from https (or inline data: images);
// - email open-tracking pixels are dropped.
// Inline styles and the email's own <style> block are kept so the layout looks
// like the email; inside the frame they cannot reach the portal's page.
import sanitizeHtml from 'sanitize-html';

/** Hosts that only serve tracking pixels or click trackers. */
const TRACKING_HOSTS = [/^email-mg\.flocknote\.com$/i, /^email\.mg\./i];

const isTracker = (url: string) => {
  try {
    return TRACKING_HOSTS.some((r) => r.test(new URL(url).hostname));
  } catch {
    return false;
  }
};

/** Footer blocks that only make sense in the email (unsubscribe, "sent by"). */
function stripEmailFooter(html: string) {
  const start = html.search(/<div[^>]*id=["']?footer1_around/i);
  if (start === -1) return html;
  // Remove from the footer to the end of its enclosing <div>, counting nesting.
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + html.slice(m.index + m[0].length);
  }
  return html.slice(0, start);
}

export const MAX_NEWSLETTER_HTML = 1_500_000;

export function sanitizeEmailHtml(raw: string): string {
  const input = stripEmailFooter(String(raw ?? ''));
  const clean = sanitizeHtml(input, {
    allowedTags: [
      'html', 'head', 'body', 'title', 'style',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'center',
      'div', 'span', 'p', 'br', 'hr', 'font', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'big', 'sup', 'sub',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'a', 'img', 'figure', 'figcaption',
    ],
    // Allowing <style> is safe only because the output is shown in an isolated frame.
    allowVulnerableTags: true,
    allowedAttributes: {
      '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'dir', 'title', 'lang'],
      table: ['cellpadding', 'cellspacing', 'role', 'summary'],
      td: ['colspan', 'rowspan', 'nowrap'],
      th: ['colspan', 'rowspan', 'scope'],
      font: ['color', 'face', 'size'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'data'] },
    allowProtocolRelative: false,
    // Drop the contents of these entirely rather than keeping their text.
    nonTextTags: ['script', 'noscript', 'textarea', 'option', 'iframe', 'object', 'embed', 'template'],
    exclusiveFilter: (frame) => frame.tag === 'img' && (!frame.attribs.src || isTracker(frame.attribs.src)),
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        const external = /^https?:/i.test(href);
        return {
          tagName,
          attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' } : { ...attribs, target: '_top' },
        };
      },
    },
  });
  return clean;
}

/** Plain text of the HTML (for search and as a fallback summary). */
export function emailText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['style', 'script', 'title', 'head'] })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
