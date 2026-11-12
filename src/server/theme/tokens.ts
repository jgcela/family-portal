// Theme engine: a school's look is a small, validated set of tokens compiled to
// CSS custom properties. Schools never supply raw CSS or JavaScript.
import { z } from 'zod';
import { adjustForContrast, contrastRatio, isHexColor, readableOn } from './contrast';

export const FONT_OPTIONS = {
  inter: { label: 'Inter', stack: "'Inter Variable', 'Inter', system-ui, sans-serif", kind: 'sans' },
  'libre-franklin': { label: 'Libre Franklin', stack: "'Libre Franklin Variable', system-ui, sans-serif", kind: 'sans' },
  'open-sans': { label: 'Open Sans', stack: "'Open Sans Variable', system-ui, sans-serif", kind: 'sans' },
  'nunito-sans': { label: 'Nunito Sans', stack: "'Nunito Sans Variable', system-ui, sans-serif", kind: 'sans' },
  'atkinson-hyperlegible': {
    label: 'Atkinson Hyperlegible',
    stack: "'Atkinson Hyperlegible', system-ui, sans-serif",
    kind: 'sans',
  },
  'source-serif-4': { label: 'Source Serif 4', stack: "'Source Serif 4 Variable', Georgia, serif", kind: 'serif' },
  lora: { label: 'Lora', stack: "'Lora Variable', Georgia, serif", kind: 'serif' },
  fraunces: { label: 'Fraunces', stack: "'Fraunces Variable', Georgia, serif", kind: 'serif' },
} as const;
export type FontId = keyof typeof FONT_OPTIONS;
const fontIds = Object.keys(FONT_OPTIONS) as [FontId, ...FontId[]];

export const RADIUS_PRESETS = { sharp: '4px', soft: '10px', round: '18px' } as const;

const hex = z
  .string()
  .trim()
  .refine(isHexColor, 'Use a 6-digit hex colour such as #16335B')
  .transform((v) => v.toUpperCase());

// Only http(s) or same-origin paths are allowed for images.
const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v.startsWith('/') || /^https:\/\//.test(v), 'Image must be an https URL or uploaded asset');

export const themeTokensSchema = z
  .object({
    colors: z
      .object({
        primary: hex,
        secondary: hex,
        accent: hex,
        background: hex,
        surface: hex,
        text: hex,
      })
      .strict(),
    fonts: z.object({ heading: z.enum(fontIds), body: z.enum(fontIds) }).strict(),
    radius: z.enum(['sharp', 'soft', 'round']),
    header: z.enum(['solid', 'light']),
    appearance: z.enum(['light', 'dark', 'system']),
    logo: z
      .object({
        primary: imageUrl.nullable(),
        onDark: imageUrl.nullable(),
        favicon: imageUrl.nullable(),
      })
      .strict(),
  })
  .strict();

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export const DEFAULT_THEME: ThemeTokens = {
  colors: {
    primary: '#1F3A5F',
    secondary: '#3D5A80',
    accent: '#E0A100',
    background: '#FAFAF7',
    surface: '#FFFFFF',
    text: '#1A1F2B',
  },
  fonts: { heading: 'source-serif-4', body: 'inter' },
  radius: 'soft',
  header: 'solid',
  appearance: 'light',
  logo: { primary: null, onDark: null, favicon: null },
};

export type ThemeIssue = { level: 'error' | 'warning'; field: string; message: string };

/**
 * Errors block publishing; warnings are shown but allowed.
 * Body text must meet WCAG AA (4.5:1). Brand fills only need white/black text
 * to be readable on them, which compileTheme guarantees automatically.
 */
export function validateTheme(tokens: ThemeTokens): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  const { colors } = tokens;
  const textBg = contrastRatio(colors.text, colors.background);
  if (textBg < 4.5) {
    issues.push({
      level: 'error',
      field: 'colors.text',
      message: `Text on background has contrast ${textBg.toFixed(2)}:1. It needs at least 4.5:1.`,
    });
  }
  const textSurface = contrastRatio(colors.text, colors.surface);
  if (textSurface < 4.5) {
    issues.push({
      level: 'error',
      field: 'colors.surface',
      message: `Text on cards has contrast ${textSurface.toFixed(2)}:1. It needs at least 4.5:1.`,
    });
  }
  const primaryBg = contrastRatio(colors.primary, colors.background);
  if (primaryBg < 3) {
    issues.push({
      level: 'warning',
      field: 'colors.primary',
      message: `Primary colour is hard to see on the background (${primaryBg.toFixed(2)}:1). Links will use a darker shade automatically.`,
    });
  }
  const accentBg = contrastRatio(colors.accent, colors.background);
  if (accentBg < 3) {
    issues.push({
      level: 'warning',
      field: 'colors.accent',
      message: `Accent colour is low-contrast on the background (${accentBg.toFixed(2)}:1). It will only be used for fills, never for text.`,
    });
  }
  return issues;
}

export function hasBlockingIssues(tokens: ThemeTokens): boolean {
  return validateTheme(tokens).some((i) => i.level === 'error');
}

/**
 * Compiles tokens into CSS custom properties. Derived "on-*" colours and the
 * link colour are always readable regardless of what the school picked.
 * Output contains only validated hex values and whitelisted font stacks, so
 * it is safe to inline in a <style> tag.
 */
export function compileTheme(input: ThemeTokens): Record<string, string> {
  const tokens = themeTokensSchema.parse(input);
  const c = tokens.colors;
  // If the stored text colour fails, fall back to a readable one at render time.
  const text = contrastRatio(c.text, c.background) >= 4.5 ? c.text : readableOn(c.background);
  return {
    '--color-primary': c.primary,
    '--color-on-primary': readableOn(c.primary),
    '--color-secondary': c.secondary,
    '--color-on-secondary': readableOn(c.secondary),
    '--color-accent': c.accent,
    '--color-on-accent': readableOn(c.accent),
    '--color-background': c.background,
    '--color-surface': c.surface,
    '--color-text': text,
    '--color-text-muted': adjustForContrast(mixHex(text, c.background, 0.35), c.background, 4.5),
    '--color-link': adjustForContrast(c.primary, c.background, 4.5),
    '--font-heading': FONT_OPTIONS[tokens.fonts.heading].stack,
    '--font-body': FONT_OPTIONS[tokens.fonts.body].stack,
    '--radius': RADIUS_PRESETS[tokens.radius],
  };
}

export function themeToCss(tokens: ThemeTokens, selector = ':root'): string {
  const vars = compileTheme(tokens);
  return `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
}

function mixHex(a: string, b: string, amount: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
}
