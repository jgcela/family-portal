import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, Group, Row, Screen, Section, Separator, Tag, Text } from '@/components/primitives';
import { QueryView } from '@/components/states';
import { documents } from '@/data/sample';
import { longDate, time } from '@/lib/dates';
import { schoolById } from '@/lib/lookup';
import { useOpen } from '@/lib/nav';
import { useAnnouncement } from '@/services/queries';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';
import { schoolColors, useAppTheme } from '@/theme/use-app-theme';

export default function AnnouncementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useAnnouncement(id);
  const { markRead, schoolHasAsk } = useAppState();
  const { scheme } = useAppTheme();
  const open = useOpen();

  useEffect(() => {
    if (q.data) markRead(q.data.id);
  }, [q.data, markRead]);

  return (
    <>
      <Stack.Screen options={{ title: 'Announcement' }} />
      <Screen>
        <QueryView query={q}>
          {(a) => {
            const school = schoolById(a.schoolId);
            const published = new Date(a.publishedAt);
            const attachments = documents.filter((d) => a.attachmentIds.includes(d.id));
            return (
              <>
                <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm }}>
                  {a.important && (
                    <Text variant="caption" tone="danger">
                      Important
                    </Text>
                  )}
                  <Text variant="title" accessibilityRole="header">
                    {a.title}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Tag label={school?.shortName ?? ''} color={schoolColors(a.schoolId, scheme).accent} />
                    <Text variant="footnote" tone="secondary">
                      {longDate(published)}, {time(published)}
                    </Text>
                  </View>
                </View>
                <Section>
                  <Text variant="body">{a.body}</Text>
                </Section>
                {attachments.length > 0 && (
                  <Section title="Attachments">
                    <Group>
                      {attachments.map((d, i) => (
                        <View key={d.id}>
                          {i > 0 && <Separator />}
                          <Row icon="document" title={d.title} subtitle={`${d.pages} page${d.pages === 1 ? '' : 's'}`} onPress={() => open(`document/${d.id}`)} />
                        </View>
                      ))}
                    </Group>
                  </Section>
                )}
                {schoolHasAsk(a.schoolId) && (
                  <Section footer="Ask answers only from your school's information and shows its sources.">
                    <Button
                      label="Ask about this"
                      icon="ask"
                      variant="secondary"
                      onPress={() => router.push({ pathname: '/ask', params: { contextType: 'announcement', contextId: a.id, contextTitle: a.title } })}
                    />
                  </Section>
                )}
              </>
            );
          }}
        </QueryView>
      </Screen>
    </>
  );
}
