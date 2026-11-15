// Text extraction for knowledge sources. Produces plain-text sections with a
// heading (document section or page number) so answers can name the
// "relevant section". Nothing here renders or executes the content: HTML is
// reduced to text, scripts and styles are dropped.

export type Section = { heading: string | null; text: string };

export class UnsupportedFormatError extends Error {
  constructor(contentType: string) {
    super(`Text can't be read from this file type (${contentType}). Use PDF, Word (.docx), HTML or plain text.`);
    this.name = 'UnsupportedFormatError';
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function normalizeSpace(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** HTML to sections split at h1–h4. */
export function htmlToSections(html: string): Section[] {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  // Mark headings, then block boundaries, then drop all other tags.
  s = s.replace(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]\s*>/gi, (_m, inner: string) => `\n\u0001${inner.replace(/<[^>]*>/g, ' ')}\u0002\n`);
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<(br|\/p|\/div|\/li|\/tr|\/table|\/ul|\/ol|\/section|\/article|\/h[5-6])\b[^>]*>/gi, '\n\n');
  s = s.replace(/<\/t[dh]\s*>/gi, ' | ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s);
  const out: Section[] = [];
  let heading: string | null = null;
  for (const part of s.split(/(\u0001[\s\S]*?\u0002)/)) {
    if (part.startsWith('\u0001')) {
      heading = normalizeSpace(part.slice(1, -1)).replace(/\n/g, ' ') || null;
      continue;
    }
    const text = normalizeSpace(part);
    if (text) out.push({ heading, text });
  }
  return out;
}

/** Markdown (portal pages and announcements) split at # headings. */
export function markdownToSections(md: string, fallbackHeading: string | null = null): Section[] {
  const out: Section[] = [];
  let heading = fallbackHeading;
  let buf: string[] = [];
  const flush = () => {
    const text = normalizeSpace(
      buf
        .join('\n')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/[*_`]{1,3}/g, '')
        .replace(/^>\s?/gm, ''),
    );
    if (text) out.push({ heading, text });
    buf = [];
  };
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const h = /^#{1,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      heading = h[1]!.replace(/[*_`]/g, '').trim();
    } else buf.push(line);
  }
  flush();
  return out;
}

export async function pdfToSections(bytes: Uint8Array): Promise<Section[]> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages
    .map((t, i) => ({ heading: `Page ${i + 1}`, text: normalizeSpace(t) }))
    .filter((s) => s.text.length > 0);
}

export async function docxToSections(bytes: Uint8Array): Promise<Section[]> {
  const mammoth = (await import('mammoth')).default;
  const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  return htmlToSections(value);
}

export async function extractSections(bytes: Uint8Array, contentType: string): Promise<Section[]> {
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  if (ct === 'application/pdf') return pdfToSections(bytes);
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return docxToSections(bytes);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (ct === 'text/html') return htmlToSections(text);
  if (ct === 'text/markdown') return markdownToSections(text);
  if (ct === 'text/plain' || ct === 'text/csv') {
    const t = normalizeSpace(text);
    return t ? [{ heading: null, text: t }] : [];
  }
  throw new UnsupportedFormatError(ct);
}

/** Pasted text: HTML if it looks like HTML, otherwise Markdown/plain. */
export function pastedToSections(text: string): Section[] {
  return /<\/?(p|div|h[1-6]|ul|ol|li|table|br|span|strong|em)\b/i.test(text) ? htmlToSections(text) : markdownToSections(text);
}
