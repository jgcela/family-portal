import { NativeTabs } from 'expo-router/native-tabs';

import { useAnnouncements } from '@/services/queries';
import { useAppState } from '@/state/app-state';
import { useAppTheme } from '@/theme/use-app-theme';

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const { askAvailable, readIds } = useAppState();
  const announcements = useAnnouncements();
  const unread = (announcements.data ?? []).filter((a) => !readIds.has(a.id)).length;

  return (
    <NativeTabs tintColor={colors.tint} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      {/* Only on plans with AI (Smart, Autonomous) and when the school turned the assistant on. */}
      <NativeTabs.Trigger name="ask" hidden={!askAvailable}>
        <NativeTabs.Trigger.Label>Ask</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'tray', selected: 'tray.fill' }} md="inbox" />
        {unread > 0 ? <NativeTabs.Trigger.Badge>{String(unread)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="family">
        <NativeTabs.Trigger.Label>Family</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="family_restroom" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
