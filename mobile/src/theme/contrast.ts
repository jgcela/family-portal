// Pure color math, shared by the theme and tests (no React Native imports).

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Darkens (on light backgrounds) or lightens (on dark ones) a color until it reaches the target contrast. */
export function ensureContrast(color: string, background: string, target = 4.5): string {
  let c = parseHex(color);
  const towardWhite = luminance(background) < 0.5;
  for (let i = 0; i < 40 && contrastRatio(toHex(c), background) < target; i++) {
    c = c.map((v) => (towardWhite ? v + (255 - v) * 0.12 : v * 0.88)) as [number, number, number];
  }
  return toHex(c);
}

/** Black or white, whichever reads better on the given fill. */
export function onColor(fill: string): string {
  return contrastRatio('#FFFFFF', fill) >= contrastRatio('#111418', fill) ? '#FFFFFF' : '#111418';
}
