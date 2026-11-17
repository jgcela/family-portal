import { Stack } from 'expo-router';

import { Group, Screen, Section, Text } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { schoolById } from '@/lib/lookup';
import { useWishlists } from '@/services/queries';
import { spacing } from '@/theme/tokens';

export default function Community() {
  const q = useWishlists();
  return (
    <>
      <Stack.Screen options={{ title: 'Community' }} />
      <Screen>
        <QueryView query={q} skeletonRows={3}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="heart" title="No wish lists yet." />
            ) : (
              items.map((w) => (
                <Section key={w.id} title={w.name} footer={`${w.role} · ${schoolById(w.schoolId)?.shortName ?? ''}`}>
                  <Group style={{ padding: spacing.lg, gap: spacing.xs }}>
                    {w.items.map((it) => (
                      <Text key={it} variant="body">
                        • {it}
                      </Text>
                    ))}
                  </Group>
                </Section>
              ))
            )
          }
        </QueryView>
      </Screen>
    </>
  );
}
