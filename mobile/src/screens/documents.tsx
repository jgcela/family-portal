import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Field } from '@/components/form';
import { Group, Row, Screen, Section, Separator } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { relative } from '@/lib/dates';
import { schoolById } from '@/lib/lookup';
import { useOpen } from '@/lib/nav';
import { useDocuments } from '@/services/queries';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';

export default function Documents() {
  const q = useDocuments();
  const open = useOpen();
  const { schoolFilter } = useAppState();
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (q.data ?? []).filter((d) => !term || `${d.title} ${d.category} ${d.excerpt}`.toLowerCase().includes(term));
    const m = new Map<string, typeof list>();
    for (const d of list) m.set(d.category, [...(m.get(d.category) ?? []), d]);
    return [...m.entries()];
  }, [q.data, search]);

  return (
    <>
      <Stack.Screen options={{ title: 'Documents' }} />
      <Screen>
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <Field label="Search documents" value={search} onChangeText={setSearch} placeholder="Lunch, handbook, uniform…" returnKeyType="search" clearButtonMode="while-editing" />
        </View>
        <QueryView query={q} skeletonRows={4}>
          {() =>
            groups.length === 0 ? (
              <EmptyState
                icon="document"
                title={search ? `No documents match “${search}”.` : 'Your school has not shared documents yet.'}
                action={search ? { label: 'Clear search', onPress: () => setSearch('') } : undefined}
              />
            ) : (
              groups.map(([cat, docs]) => (
                <Section key={cat} title={cat}>
                  <Group>
                    {docs.map((d, i) => (
                      <View key={d.id}>
                        {i > 0 && <Separator inset={50} />}
                        <Row
                          icon="document"
                          title={d.title}
                          subtitle={`${schoolFilter === 'all' ? `${schoolById(d.schoolId)?.shortName} · ` : ''}Updated ${relative(new Date(d.updatedAt)).toLowerCase()}`}
                          onPress={() => open(`document/${d.id}`)}
                        />
                      </View>
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
