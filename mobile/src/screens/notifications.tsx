import { Stack } from 'expo-router';
import { View } from 'react-native';

import type { IconName } from '@/components/icon';
import { Group, Row, Screen, Section, Separator } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import type { AppNotification } from '@/data/types';
import { relative } from '@/lib/dates';
import { useOpen } from '@/lib/nav';
import { useNotifications } from '@/services/queries';

const icons: Record<AppNotification['kind'], IconName> = {
  announcement: 'inbox',
  urgent: 'warning',
  absence: 'absence',
  request: 'mail',
  calendar: 'calendar',
};

export default function Notifications() {
  const q = useNotifications();
  const open = useOpen();
  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <Screen>
        <Section footer="On the lock screen, notifications show only the school and the kind of update, never your child's name. Prototype: these are examples; real push notifications come later.">
          <QueryView query={q}>
            {(items) =>
              items.length === 0 ? (
                <Group>
                  <EmptyState icon="bell" title="No notifications yet." />
                </Group>
              ) : (
                <Group>
                  {items.map((n, i) => (
                    <View key={n.id}>
                      {i > 0 && <Separator inset={50} />}
                      <Row icon={icons[n.kind]} title={n.title} subtitle={relative(new Date(n.at))} onPress={() => open(`${n.target.type}/${n.target.id}`)} />
                    </View>
                  ))}
                </Group>
              )
            }
          </QueryView>
        </Section>
      </Screen>
    </>
  );
}
