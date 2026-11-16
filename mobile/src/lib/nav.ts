import { useRouter, useSegments } from 'expo-router';
import { useCallback } from 'react';

export type TabName = 'home' | 'calendar' | 'ask' | 'inbox' | 'family';
const TABS: readonly TabName[] = ['home', 'calendar', 'ask', 'inbox', 'family'];

/** The tab the current screen lives in, so detail screens open inside the same tab and keep the tab bar. */
export function useCurrentTab(): TabName {
  const segments = useSegments() as string[];
  const tab = segments.find((s): s is TabName => (TABS as readonly string[]).includes(s));
  return tab ?? 'home';
}

export type DetailPath =
  | `child/${string}`
  | `event/${string}`
  | `announcement/${string}`
  | `absence/${string}`
  | `request/${string}`
  | `document/${string}`;

/** Push a detail screen in the current tab's stack. */
export function useOpen() {
  const router = useRouter();
  const tab = useCurrentTab();
  return useCallback((path: DetailPath | string) => router.push(`/${tab}/${path}` as never), [router, tab]);
}
