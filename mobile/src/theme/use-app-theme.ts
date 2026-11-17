import { useColorScheme } from 'react-native';

import { schools } from '@/data/sample';
import { useAppState } from '@/state/app-state';

import { brand, ensureContrast, onColor, palette, radii, type Palette } from './tokens';

export type AppTheme = {
  scheme: 'light' | 'dark';
  colors: Palette & {
    /** School primary (or FAMITENLY blue in "All schools"), adjusted to read on the background. */
    tint: string;
    /** Text/icon color on a `tint` fill. */
    onTint: string;
    /** School accent, used for unread dots and school tags. */
    accent: string;
  };
  radius: number;
};

export function schoolColors(schoolId: string, scheme: 'light' | 'dark') {
  const s = schools.find((x) => x.id === schoolId);
  const bg = palette[scheme].bg;
  const base = s?.primary ?? brand.ink;
  return { tint: ensureContrast(base, bg, scheme === 'dark' ? 4.5 : 4.5), accent: s?.accent ?? brand.start };
}

/** Colors for the current screen: the selected school's, or FAMITENLY's in "All schools". */
export function useAppTheme(): AppTheme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { selectedSchool } = useAppState();
  const p = palette[scheme];
  const base = selectedSchool?.primary ?? brand.ink;
  const tint = ensureContrast(base, p.bg);
  return {
    scheme,
    colors: { ...p, tint, onTint: onColor(tint), accent: selectedSchool?.accent ?? brand.start },
    radius: radii[selectedSchool?.radius ?? 'soft'],
  };
}
