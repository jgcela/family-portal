import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Button, Group, Row, Screen, Section, Separator, Text, TextButton } from '@/components/primitives';
import type { PrototypeOptions } from '@/services/prototype';
import { useQueryClient } from '@tanstack/react-query';
import { useOpen } from '@/lib/nav';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useAppTheme();
  return (
    <Row
      title={title}
      subtitle={subtitle}
      showChevron={false}
      trailing={<Switch value={value} onValueChange={onChange} trackColor={{ true: colors.tint }} accessibilityLabel={title} />}
    />
  );
}

const PROTOTYPE_SWITCHES: { key: keyof PrototypeOptions; title: string; subtitle: string }[] = [
  { key: 'essentialPlan', title: 'Essential plan (no AI)', subtitle: 'Hides the Ask tab, as on the Essential plan' },
  { key: 'askQuotaReached', title: 'Assistant limit reached', subtitle: 'Ask shows the monthly limit message' },
  { key: 'emptyData', title: 'Empty lists', subtitle: 'See every empty state' },
  { key: 'failRequests', title: 'Requests fail', subtitle: 'See every error state' },
  { key: 'offline', title: 'Offline', subtitle: 'Saved data stays; new data fails' },
  { key: 'requireTwoStep', title: 'Ask for two-step code', subtitle: 'At the next sign-in' },
];

export default function Settings() {
  const { signOut, options, setOption } = useAppState();
  const qc = useQueryClient();
  const open = useOpen();
  const [faceId, setFaceId] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Screen>
        <Section title="Account">
          <Group>
            <Row icon="person" title="Ana Rivera" subtitle="ana.rivera@example.com" showChevron={false} />
            <Separator inset={50} />
            <Row icon="lock" title="Password and two-step sign-in" subtitle="Change them on the web portal" showChevron={false} />
          </Group>
        </Section>

        <Section title="Security" footer="Prototype: the switch is saved, but Face ID itself arrives in a later phase.">
          <Group>
            <ToggleRow title="Unlock with Face ID" subtitle="Asks for Face ID when you open the app" value={faceId} onChange={setFaceId} />
          </Group>
        </Section>

        <Section title="Notifications">
          <Group>
            <Row icon="bell" title="Notification settings" onPress={() => open('notification-settings')} />
          </Group>
        </Section>

        <Section title="Privacy and help">
          <Group>
            <Row icon="shield" title="Privacy" subtitle="What this app keeps on your phone" onPress={() => open('privacy')} />
            <Separator inset={50} />
            <Row icon="help" title="Help" subtitle="Contact your school office for help with your account" onPress={() => open('contact')} />
          </Group>
        </Section>

        <Section title="Prototype options" footer="Only in the prototype. They let you see every screen state.">
          <Group>
            {PROTOTYPE_SWITCHES.map((sw, i) => (
              <View key={sw.key}>
                {i > 0 && <Separator />}
                <ToggleRow
                  title={sw.title}
                  subtitle={sw.subtitle}
                  value={options[sw.key]}
                  onChange={(v) => {
                    setOption(sw.key, v);
                    if (sw.key !== 'requireTwoStep' && sw.key !== 'essentialPlan') void qc.resetQueries();
                  }}
                />
              </View>
            ))}
          </Group>
        </Section>

        <Section>
          {confirmSignOut ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="subhead">Sign out of FAMITENLY on this phone? Saved information is removed from this phone.</Text>
              <Button
                label="Sign out"
                variant="destructive"
                onPress={() => {
                  qc.clear();
                  signOut();
                  router.replace('/welcome');
                }}
              />
              <TextButton label="Stay signed in" onPress={() => setConfirmSignOut(false)} />
            </View>
          ) : (
            <Group>
              <Row icon="signOut" title="Sign out" destructive onPress={() => setConfirmSignOut(true)} />
            </Group>
          )}
        </Section>
      </Screen>
    </>
  );
}
