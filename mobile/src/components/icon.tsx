import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';

type SymbolName = Exclude<ComponentProps<typeof SymbolView>['name'], string>;

// One icon set for both platforms: SF Symbols on iOS, Material Symbols on Android.
const ICONS = {
  home: { ios: 'house', android: 'home', web: 'home' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  ask: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  inbox: { ios: 'tray', android: 'inbox', web: 'inbox' },
  family: { ios: 'person.2', android: 'family_restroom', web: 'family_restroom' },
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'arrow_drop_down', web: 'arrow_drop_down' },
  event: { ios: 'calendar.badge.clock', android: 'event', web: 'event' },
  document: { ios: 'doc.text', android: 'description', web: 'description' },
  person: { ios: 'person.crop.circle', android: 'person', web: 'person' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  link: { ios: 'link', android: 'link', web: 'link' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  error: { ios: 'exclamationmark.triangle', android: 'error', web: 'error' },
  warning: { ios: 'exclamationmark.circle', android: 'warning', web: 'warning' },
  offline: { ios: 'wifi.slash', android: 'cloud_off', web: 'cloud_off' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  send: { ios: 'arrow.up.circle.fill', android: 'send', web: 'send' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  volunteer: { ios: 'hand.raised', android: 'volunteer_activism', web: 'volunteer_activism' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  phone: { ios: 'phone', android: 'call', web: 'call' },
  mail: { ios: 'envelope', android: 'mail', web: 'mail' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  lock: { ios: 'lock', android: 'lock', web: 'lock' },
  help: { ios: 'questionmark.circle', android: 'help', web: 'help' },
  shield: { ios: 'hand.raised.fill', android: 'shield', web: 'shield' },
  absence: { ios: 'figure.walk.departure', android: 'sick', web: 'sick' },
  school: { ios: 'building.columns', android: 'school', web: 'school' },
} as const satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

export const tabIcons = ICONS;
