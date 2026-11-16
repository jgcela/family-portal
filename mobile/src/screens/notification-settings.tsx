import { Stack } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Group, Row, Screen, Section, Separator } from '@/components/primitives';
import { useAppTheme } from '@/theme/use-app-theme';

const KINDS = [
  { key: 'announcements', title: 'School announcements', subtitle: 'New announcements from your schools' },
  { key: 'absences', title: 'Absence reports', subtitle: 'When the office reviews or records a report' },
  { key: 'requests', title: 'Office replies', subtitle: 'When the office answers a request' },
  { key: 'calendar', title: 'Calendar changes', subtitle: 'When an event changes or is cancelled' },
] as const;

export default function NotificationSettings() {
  const { colors } = useAppTheme();
  const [on, setOn] = useState<Record<string, boolean>>({ announcements: true, absences: true, requests: true, calendar: true });
  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <Screen>
        <Section footer="Prototype: these switches don't send anything yet. Push notifications arrive in a later phase.">
          <Group>
            {KINDS.map((k, i) => (
              <View key={k.key}>
                {i > 0 && <Separator />}
                <Row
                  title={k.title}
                  subtitle={k.subtitle}
                  showChevron={false}
                  trailing={
                    <Switch value={on[k.key]} onValueChange={(v) => setOn({ ...on, [k.key]: v })} trackColor={{ true: colors.tint }} accessibilityLabel={k.title} />
                  }
                />
              </View>
            ))}
          </Group>
        </Section>
        <Section footer="Your school can mark an announcement as urgent, for example a closure. Urgent updates always arrive, even if announcements are off.">
          <Group>
            <Row title="Urgent updates" subtitle="Always on" showChevron={false} />
          </Group>
        </Section>
      </Screen>
    </>
  );
}
