import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EventRow, Initial, StatusRow } from '@/components/family-ui';
import { Button, Group, Row, Screen, Section, Separator, Text } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { daysBetween } from '@/lib/dates';
import { absenceStatusLabel, absenceTypeLabel, absenceWhen, childById, schoolById } from '@/lib/lookup';
import { useOpen } from '@/lib/nav';
import { useAbsences, useEvents } from '@/services/queries';
import { spacing } from '@/theme/tokens';

export default function ChildScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const open = useOpen();
  const child = childById(id);
  const events = useEvents();
  const absences = useAbsences();

  if (!child) {
    return (
      <Screen>
        <EmptyState icon="person" title="This child is not linked to your account" body="Contact the school office if this looks wrong." />
      </Screen>
    );
  }

  const school = schoolById(child.schoolId);
  const now = new Date();
  const upcoming = (events.data ?? [])
    .filter((e) => e.schoolId === child.schoolId && (e.childIds.length === 0 || e.childIds.includes(child.id)))
    .filter((e) => {
      const d = daysBetween(now, new Date(e.start));
      return d >= 0 && d <= 14;
    });
  const mine = (absences.data ?? []).filter((a) => a.childId === child.id);

  return (
    <>
      <Stack.Screen options={{ title: child.firstName }} />
      <Screen>
        <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
          <Initial child={child} size={72} />
          <Text variant="title" accessibilityRole="header">
            {child.firstName} {child.lastName}
          </Text>
          <Text variant="subhead" tone="secondary">
            {child.grade} · {school?.name}
          </Text>
        </View>

        {child.canReportAbsence && (
          <Section>
            <Button label="Report absence" icon="absence" onPress={() => router.push({ pathname: '/report-absence', params: { childId: child.id } })} />
          </Section>
        )}

        <Section title="Coming up">
          <QueryView query={events} skeletonRows={2}>
            {() =>
              upcoming.length === 0 ? (
                <Group>
                  <EmptyState icon="calendar" title={`Nothing on ${child.firstName}'s calendar in the next two weeks.`} />
                </Group>
              ) : (
                <Group>
                  {upcoming.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <Separator />}
                      <EventRow event={e} showSchool={false} onPress={() => open(`event/${e.id}`)} />
                    </View>
                  ))}
                </Group>
              )
            }
          </QueryView>
        </Section>

        <Section title="Absences you reported">
          <QueryView query={absences} skeletonRows={1}>
            {() =>
              mine.length === 0 ? (
                <Group>
                  <Text variant="subhead" tone="secondary" style={{ padding: spacing.lg }}>
                    No absences reported.
                  </Text>
                </Group>
              ) : (
                <Group>
                  {mine.map((a, i) => (
                    <View key={a.id}>
                      {i > 0 && <Separator />}
                      <StatusRow
                        title={absenceTypeLabel[a.type]}
                        subtitle={absenceWhen(a)}
                        status={a.status}
                        statusLabel={absenceStatusLabel[a.status]}
                        onPress={() => open(`absence/${a.id}`)}
                      />
                    </View>
                  ))}
                </Group>
              )
            }
          </QueryView>
        </Section>

        <Section footer={`Grades, homework and attendance history are kept in FACTS by ${school?.shortName ?? 'the school'}.`}>
          <Group>
            <Row icon="link" title="Open FACTS" onPress={() => router.push('/family/links')} />
          </Group>
        </Section>
      </Screen>
    </>
  );
}
