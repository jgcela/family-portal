// WCAG 2.x contrast math. Used to validate school colour choices.

export type Rgb = { r: number; g: number; b: number };

const HEX_RE = /^#([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

export function parseHex(hex: string): Rgb {
  const m = HEX_RE.exec(hex);
  if (!m) throw new Error(`Invalid colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const DARK_TEXT = '#111827';
export const LIGHT_TEXT = '#FFFFFF';

/** The more readable of near-black or white on the given background. */
export function readableOn(background: string): string {
  return contrastRatio(background, DARK_TEXT) >= contrastRatio(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

function toHex({ r, g, b }: Rgb): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/**
 * Darkens or lightens `color` until it reaches `target` contrast against
 * `background`. Used to derive an accessible text/link variant of a brand
 * colour without changing the colour the school chose for fills.
 */
export function adjustForContrast(color: string, background: string, target = 4.5): string {
  if (contrastRatio(color, background) >= target) return color.toUpperCase();
  const towardsDark = relativeLuminance(background) > 0.5;
  const base = parseHex(color);
  for (let step = 1; step <= 20; step++) {
    const f = step / 20;
    const mix = towardsDark
      ? { r: base.r * (1 - f), g: base.g * (1 - f), b: base.b * (1 - f) }
      : { r: base.r + (255 - base.r) * f, g: base.g + (255 - base.g) * f, b: base.b + (255 - base.b) * f };
    const hex = toHex(mix);
    if (contrastRatio(hex, background) >= target) return hex;
  }
  return towardsDark ? DARK_TEXT : LIGHT_TEXT;
}
