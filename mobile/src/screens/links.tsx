import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';

import { Group, Row, Screen, Section, Separator } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { schoolById } from '@/lib/lookup';
import { useLinks } from '@/services/queries';
import { useAppState } from '@/state/app-state';

export default function Links() {
  const q = useLinks();
  const { schoolFilter } = useAppState();
  return (
    <>
      <Stack.Screen options={{ title: 'Quick links' }} />
      <Screen>
        <Section footer="Links open inside the app. Prototype: they go to example.com.">
          <QueryView query={q} skeletonRows={3}>
            {(items) =>
              items.length === 0 ? (
                <Group>
                  <EmptyState icon="link" title="No links yet." />
                </Group>
              ) : (
                <Group>
                  {items.map((l, i) => (
                    <View key={l.id}>
                      {i > 0 && <Separator inset={50} />}
                      <Row
                        icon="link"
                        title={l.title}
                        subtitle={schoolFilter === 'all' ? `${l.description} · ${schoolById(l.schoolId)?.shortName}` : l.description}
                        onPress={() => void WebBrowser.openBrowserAsync(l.url)}
                      />
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
