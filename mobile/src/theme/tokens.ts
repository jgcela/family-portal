// Design tokens for FAMITENLY Mobile.
//
// Two layers:
//   1. FAMITENLY tokens (fixed): neutrals, semantic colors, type, spacing.
//   2. School tokens (from the server, same shape the web uses): only
//      `primary` and `accent` are used here, and both are checked for contrast.

import { Platform } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export const palette = {
  light: {
    bg: '#FFFFFF',
    grouped: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceMuted: '#F2F2F7',
    text: '#111418',
    textSecondary: '#5B6470',
    separator: '#D8DCE1',
    success: '#1E7F4F',
    warning: '#A15C00',
    danger: '#B42318',
    skeleton: '#E6E8EC',
    banner: '#FFF4D6',
    bannerText: '#5C4300',
  },
  dark: {
    bg: '#000000',
    grouped: '#000000',
    surface: '#1C1C1E',
    surfaceMuted: '#2C2C2E',
    text: '#F2F2F7',
    textSecondary: '#A1A7B0',
    separator: '#38383A',
    success: '#4CC38A',
    warning: '#F5B142',
    danger: '#FF6B5E',
    skeleton: '#2C2C2E',
    banner: '#3A2F10',
    bannerText: '#F5D98A',
  },
} as const;

export type Palette = { [K in keyof (typeof palette)['light']]: string };

/** FAMITENLY brand (logo gradient #598CA2 to #ABB5B2). Used when no single school is selected. */
export const brand = {
  start: '#598CA2',
  end: '#ABB5B2',
  /** A darker brand blue that passes contrast for text and buttons on white. */
  ink: '#3E6F84',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sharp: 6, soft: 12, round: 20 } as const;
export type RadiusPreset = keyof typeof radii;

/** Minimum touch target: 44 pt on iOS, 48 dp on Android. */
export const touchTarget = Platform.OS === 'android' ? 48 : 44;

export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;
export type TypeVariant = keyof typeof type;

export { contrastRatio, ensureContrast, luminance, onColor } from './contrast';
