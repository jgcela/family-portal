import { router, Stack } from 'expo-router';
import { Linking, View } from 'react-native';

import { Button, Group, Row, Screen, Section, Separator } from '@/components/primitives';
import { schools } from '@/data/sample';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';

export default function Contact() {
  const { schoolFilter } = useAppState();
  const list = schools.filter((s) => schoolFilter === 'all' || s.id === schoolFilter);
  return (
    <>
      <Stack.Screen options={{ title: 'Contact school' }} />
      <Screen>
        {list.map((s) => (
          <Section key={s.id} title={s.name}>
            <Group>
              <Row icon="phone" title={s.phone} subtitle="Call the front office" onPress={() => void Linking.openURL(`tel:${s.phone.replace(/[^\d+]/g, '')}`)} />
              <Separator inset={50} />
              <Row icon="mail" title={s.email} subtitle="Send an email" onPress={() => void Linking.openURL(`mailto:${s.email}`)} />
              <Separator inset={50} />
              <Row icon="location" title={s.address} subtitle="Open in Maps" onPress={() => void Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(s.address)}`)} />
              <Separator inset={50} />
              <Row icon="clock" title="Office hours" subtitle={s.officeHours} />
              <Separator inset={50} />
              <Row icon="absence" title="Attendance" subtitle={s.attendanceContact} />
            </Group>
            <View style={{ marginTop: spacing.md }}>
              <Button label="Send a question to the office" variant="secondary" icon="mail" onPress={() => router.push({ pathname: '/new-request', params: { schoolId: s.id } })} />
            </View>
          </Section>
        ))}
      </Screen>
    </>
  );
}
