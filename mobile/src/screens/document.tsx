import { Stack, useLocalSearchParams } from 'expo-router';
import { Share, View } from 'react-native';

import { Button, Group, Row, Screen, Section, Separator, Text } from '@/components/primitives';
import { QueryView } from '@/components/states';
import { longDate } from '@/lib/dates';
import { schoolById } from '@/lib/lookup';
import { useDocument } from '@/services/queries';
import { spacing } from '@/theme/tokens';

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useDocument(id);
  return (
    <>
      <Stack.Screen options={{ title: 'Document' }} />
      <Screen>
        <QueryView query={q}>
          {(d) => (
            <>
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.xs }}>
                <Text variant="footnote" tone="secondary">
                  {d.category}
                </Text>
                <Text variant="title" accessibilityRole="header">
                  {d.title}
                </Text>
              </View>
              <Section>
                <Group>
                  <Row icon="school" title={schoolById(d.schoolId)?.name ?? ''} />
                  <Separator inset={50} />
                  <Row icon="clock" title={`Updated ${longDate(new Date(d.updatedAt))}`} />
                  <Separator inset={50} />
                  <Row icon="document" title={`${d.pages} page${d.pages === 1 ? '' : 's'}, PDF`} />
                </Group>
              </Section>
              <Section title="Preview">
                <Text variant="body">{d.excerpt}</Text>
              </Section>
              <Section footer="Prototype: there is no real file. The real app opens the PDF with a link that expires after a few minutes.">
                <View style={{ gap: spacing.sm }}>
                  <Button label="Open PDF" icon="document" onPress={() => {}} disabled />
                  <Button label="Share" variant="secondary" onPress={() => void Share.share({ message: d.title })} />
                </View>
              </Section>
            </>
          )}
        </QueryView>
      </Screen>
    </>
  );
}
