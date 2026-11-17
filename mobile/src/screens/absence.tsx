import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { StatusLabel } from '@/components/family-ui';
import { Button, Group, haptic, Row, Screen, Section, Separator, Text, TextButton } from '@/components/primitives';
import { QueryView } from '@/components/states';
import { relative } from '@/lib/dates';
import { absenceStatusLabel, absenceTypeLabel, absenceWhen, childById, schoolById } from '@/lib/lookup';
import { useAbsence, useCancelAbsence } from '@/services/queries';
import { spacing } from '@/theme/tokens';

const steps = ['received', 'in_review', 'recorded'] as const;
const stepText: Record<(typeof steps)[number], string> = {
  received: 'The office received your report.',
  in_review: 'The office is reviewing it.',
  recorded: 'The office recorded it in the school system.',
};

export default function AbsenceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useAbsence(id);
  const cancel = useCancelAbsence();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Absence report' }} />
      <Screen>
        <QueryView query={q}>
          {(a) => {
            const child = childById(a.childId);
            const school = schoolById(a.schoolId);
            const reached = steps.indexOf(a.status as (typeof steps)[number]);
            const canCancel = a.status === 'received' || a.status === 'in_review';
            return (
              <>
                <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.xs }}>
                  <Text variant="title" accessibilityRole="header">
                    {child?.firstName}: {absenceTypeLabel[a.type]}
                  </Text>
                  <StatusLabel status={a.status} label={absenceStatusLabel[a.status]} />
                </View>
                <Section>
                  <Group>
                    <Row icon="calendar" title={absenceWhen(a)} />
                    <Separator inset={50} />
                    <Row icon="school" title={school?.name ?? ''} />
                    {a.reason ? (
                      <>
                        <Separator inset={50} />
                        <Row icon="document" title={a.reason} />
                      </>
                    ) : null}
                  </Group>
                </Section>
                {a.status !== 'cancelled' && (
                  <Section title="Progress">
                    <Group>
                      {steps.map((st, i) => (
                        <View key={st}>
                          {i > 0 && <Separator inset={50} />}
                          <Row
                            icon={i <= reached ? 'check' : 'clock'}
                            title={absenceStatusLabel[st]}
                            subtitle={i <= reached ? stepText[st] : undefined}
                            accessibilityLabel={`${absenceStatusLabel[st]}, ${i <= reached ? 'done' : 'not yet'}`}
                          />
                        </View>
                      ))}
                    </Group>
                  </Section>
                )}
                <Section footer={`Sent ${relative(new Date(a.createdAt)).toLowerCase()}.`}>
                  {canCancel &&
                    (confirming ? (
                      <View style={{ gap: spacing.sm }}>
                        <Text variant="subhead">Cancel this report? The office will see that you cancelled it.</Text>
                        <Button
                          label="Cancel report"
                          variant="destructive"
                          loading={cancel.isPending}
                          onPress={() =>
                            cancel.mutate(a.id, {
                              onSuccess: () => {
                                haptic('success');
                                setConfirming(false);
                                void q.refetch();
                              },
                              onError: () => haptic('error'),
                            })
                          }
                        />
                        <TextButton label="Keep report" onPress={() => setConfirming(false)} />
                        {cancel.isError && (
                          <Text variant="footnote" tone="danger" accessibilityRole="alert">
                            {cancel.error.message}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Button label="Cancel this report" variant="secondary" onPress={() => setConfirming(true)} />
                    ))}
                </Section>
              </>
            );
          }}
        </QueryView>
      </Screen>
    </>
  );
}
