import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { StatusLabel } from '@/components/family-ui';
import { Field } from '@/components/form';
import { Button, haptic, Screen, Section, Text } from '@/components/primitives';
import { QueryView } from '@/components/states';
import { relative } from '@/lib/dates';
import { childById, requestStatusLabel, schoolById } from '@/lib/lookup';
import { useReplyToRequest, useRequest } from '@/services/queries';
import { spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function RequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useRequest(id);
  const reply = useReplyToRequest(id);
  const [text, setText] = useState('');
  const { colors, radius } = useAppTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Request' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <Screen>
          <QueryView query={q}>
            {(r) => {
              const child = r.childId ? childById(r.childId) : undefined;
              return (
                <>
                  <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.xs }}>
                    <Text variant="footnote" tone="secondary">
                      {r.type}
                      {child ? ` · ${child.firstName}` : ''} · {schoolById(r.schoolId)?.shortName}
                    </Text>
                    <Text variant="title" accessibilityRole="header">
                      {r.subject}
                    </Text>
                    <StatusLabel status={r.status} label={requestStatusLabel[r.status]} />
                  </View>
                  <Section>
                    <View style={{ gap: spacing.md }}>
                      {r.messages.map((m, i) => {
                        const mine = m.from === 'family';
                        return (
                          <View
                            key={i}
                            style={[
                              s.bubble,
                              {
                                alignSelf: mine ? 'flex-end' : 'flex-start',
                                backgroundColor: mine ? colors.tint : colors.surface,
                                borderRadius: Math.max(radius, 14),
                              },
                            ]}
                            accessibilityLabel={`${mine ? 'You' : m.author}, ${relative(new Date(m.at))}: ${m.body}`}>
                            <Text variant="caption" style={{ color: mine ? colors.onTint : colors.textSecondary }}>
                              {mine ? 'You' : m.author} · {relative(new Date(m.at))}
                            </Text>
                            <Text variant="body" style={{ color: mine ? colors.onTint : colors.text }}>
                              {m.body}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </Section>
                  {r.status !== 'closed' && (
                    <Section footer="Your reply goes to the school office, not to a teacher.">
                      <View style={{ gap: spacing.sm }}>
                        <Field label="Reply" value={text} onChangeText={setText} multiline error={reply.isError ? reply.error.message : undefined} />
                        <Button
                          label="Send reply"
                          icon="send"
                          disabled={!text.trim()}
                          loading={reply.isPending}
                          onPress={() =>
                            reply.mutate(text.trim(), {
                              onSuccess: () => {
                                haptic('success');
                                setText('');
                                void q.refetch();
                              },
                              onError: () => haptic('error'),
                            })
                          }
                        />
                      </View>
                    </Section>
                  )}
                </>
              );
            }}
          </QueryView>
        </Screen>
      </KeyboardAvoidingView>
    </>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '85%', padding: spacing.md, gap: 4 },
});
