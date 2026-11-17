import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { Group, Row, Screen, Section, Separator } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { relative } from '@/lib/dates';
import { useConversations, useDeleteConversation } from '@/services/queries';

export default function AskHistory() {
  const q = useConversations();
  const del = useDeleteConversation();
  return (
    <>
      <Stack.Screen options={{ title: 'History' }} />
      <Screen>
        <Section footer="Your questions are private. School staff can't read them unless the school owner reviews them for quality, and that is recorded.">
          <QueryView query={q}>
            {(items) =>
              items.length === 0 ? (
                <Group>
                  <EmptyState icon="ask" title="No questions yet." body="Questions you ask appear here." />
                </Group>
              ) : (
                <Group>
                  {items.map((c, i) => (
                    <View key={c.id}>
                      {i > 0 && <Separator />}
                      <Row title={c.title} subtitle={relative(new Date(c.updatedAt))} onPress={() => router.navigate({ pathname: '/ask', params: { conversation: c.id } })} />
                    </View>
                  ))}
                </Group>
              )
            }
          </QueryView>
        </Section>
        {(q.data?.length ?? 0) > 0 && (
          <Section>
            <Group>
              <Row
                title="Delete all questions"
                destructive
                onPress={() => q.data?.forEach((c) => del.mutate(c.id))}
                accessibilityHint="Deletes your question history from this account"
              />
            </Group>
          </Section>
        )}
      </Screen>
    </>
  );
}
