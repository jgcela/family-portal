import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Button, Group, haptic, Row, Screen, Section, Separator, Tag, Text } from '@/components/primitives';
import { QueryView } from '@/components/states';
import { eventAudience, eventWhen, schoolById } from '@/lib/lookup';
import { useEvent } from '@/services/queries';
import { spacing } from '@/theme/tokens';
import { schoolColors, useAppTheme } from '@/theme/use-app-theme';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useEvent(id);
  const { scheme } = useAppTheme();
  const [added, setAdded] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Event' }} />
      <Screen>
        <QueryView query={q}>
          {(e) => {
            const school = schoolById(e.schoolId);
            const { tint } = schoolColors(e.schoolId, scheme);
            return (
              <>
                <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm }}>
                  {e.cancelled && (
                    <Text variant="headline" tone="danger">
                      Cancelled
                    </Text>
                  )}
                  <Text variant="title" accessibilityRole="header" style={e.cancelled ? { textDecorationLine: 'line-through' } : undefined}>
                    {e.title}
                  </Text>
                  <Tag label={eventAudience(e)} color={tint} />
                </View>
                <Section>
                  <Group>
                    <Row icon="clock" title={eventWhen(e)} />
                    {e.location ? (
                      <>
                        <Separator inset={50} />
                        <Row icon="location" title={e.location} />
                      </>
                    ) : null}
                    <Separator inset={50} />
                    <Row icon="school" title={school?.name ?? ''} />
                  </Group>
                </Section>
                <Section title="Details">
                  <Text variant="body">{e.description}</Text>
                </Section>
                {e.links?.length ? (
                  <Section title="Links">
                    <Group>
                      {e.links.map((l, i) => (
                        <View key={l.url}>
                          {i > 0 && <Separator />}
                          <Row icon="link" title={l.title} onPress={() => void Linking.openURL(l.url)} />
                        </View>
                      ))}
                    </Group>
                  </Section>
                ) : null}
                {!e.cancelled && (
                  <Section footer="Prototype: this does not change your phone's calendar yet. The real app will ask for permission first.">
                    <Button
                      label={added ? 'Added to Calendar' : 'Add to Calendar'}
                      icon={added ? 'check' : 'calendar'}
                      variant="secondary"
                      disabled={added}
                      onPress={() => {
                        haptic('success');
                        setAdded(true);
                      }}
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
