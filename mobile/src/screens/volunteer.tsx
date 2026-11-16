import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Group, haptic, Screen, Section, Tag, Text } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { dayLabel, time } from '@/lib/dates';
import { schoolById } from '@/lib/lookup';
import { useVolunteer } from '@/services/queries';
import { spacing } from '@/theme/tokens';
import { schoolColors, useAppTheme } from '@/theme/use-app-theme';

export default function Volunteer() {
  const q = useVolunteer();
  const { scheme } = useAppTheme();
  const [joined, setJoined] = useState<Set<string>>(new Set());
  return (
    <>
      <Stack.Screen options={{ title: 'Volunteer' }} />
      <Screen>
        <QueryView query={q} skeletonRows={3}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="volunteer" title="No open opportunities right now." body="Check back soon. Your school posts new ones during the year." />
            ) : (
              items.map((v) => {
                const d = new Date(v.date);
                const isJoined = joined.has(v.id);
                return (
                  <Section key={v.id}>
                    <Group style={{ padding: spacing.lg, gap: spacing.sm }}>
                      <Text variant="headline">{v.title}</Text>
                      <Text variant="subhead" tone="secondary">
                        {dayLabel(d)}, {time(d)} · {v.spotsLeft} spot{v.spotsLeft === 1 ? '' : 's'} left
                      </Text>
                      <Tag label={schoolById(v.schoolId)?.shortName ?? ''} color={schoolColors(v.schoolId, scheme).tint} />
                      <Text variant="body">{v.description}</Text>
                      <View style={{ marginTop: spacing.xs }}>
                        <Button
                          label={isJoined ? "You're signed up" : 'Sign up'}
                          variant={isJoined ? 'secondary' : 'primary'}
                          icon={isJoined ? 'check' : undefined}
                          disabled={isJoined}
                          onPress={() => {
                            haptic('success');
                            setJoined(new Set([...joined, v.id]));
                          }}
                        />
                      </View>
                    </Group>
                  </Section>
                );
              })
            )
          }
        </QueryView>
      </Screen>
    </>
  );
}
