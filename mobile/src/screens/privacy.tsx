import { Stack } from 'expo-router';

import { Group, Screen, Section, Text } from '@/components/primitives';
import { spacing } from '@/theme/tokens';

const ITEMS: { title: string; body: string }[] = [
  {
    title: 'Your sign-in',
    body: "Your session is kept in the phone's secure storage (the iOS Keychain or Android's encrypted storage). Signing out removes it.",
  },
  {
    title: 'What is saved on this phone',
    body: "Only recent announcements and calendar events, so you can read them without a connection. Your children's details, requests and documents are loaded each time and are not saved.",
  },
  {
    title: 'Notifications',
    body: "Lock-screen notifications show only the school and the kind of update, never your child's name.",
  },
  {
    title: 'The assistant',
    body: 'Ask only uses information your school shared with your family. Your questions are private to your account.',
  },
  {
    title: 'Who controls your data',
    body: 'Your school decides what is shared in FAMITENLY. Contact the school office to correct or remove information.',
  },
];

export default function Privacy() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy' }} />
      <Screen>
        {ITEMS.map((it) => (
          <Section key={it.title} title={it.title}>
            <Group style={{ padding: spacing.lg }}>
              <Text variant="body">{it.body}</Text>
            </Group>
          </Section>
        ))}
        <Section footer="Prototype: the app's final privacy policy will be linked here." >
          <Text variant="footnote" tone="secondary">
            FAMITENLY is operated by Famitenly, LLC.
          </Text>
        </Section>
      </Screen>
    </>
  );
}
