import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceField, Field } from '@/components/form';
import { Icon } from '@/components/icon';
import { Button, haptic, SampleDataBanner, Text, TextButton } from '@/components/primitives';
import { children, schools } from '@/data/sample';
import type { OfficeRequest } from '@/data/types';
import { useCreateRequest } from '@/services/queries';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';
import { schoolColors, useAppTheme } from '@/theme/use-app-theme';

const TYPES: OfficeRequest['type'][] = ['General question', 'Pickup change', 'Records request', 'Other'];

export default function NewRequest() {
  const params = useLocalSearchParams<{ schoolId?: string }>();
  const { colors, scheme } = useAppTheme();
  const { schoolFilter } = useAppState();
  const create = useCreateRequest();
  const [schoolId, setSchoolId] = useState<string | null>(params.schoolId ?? (schoolFilter !== 'all' ? schoolFilter : schools.length === 1 ? schools[0]!.id : null));
  const [childId, setChildId] = useState<string>('none');
  const [type, setType] = useState<OfficeRequest['type']>('General question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);

  const kids = children.filter((c) => c.schoolId === schoolId);

  if (sent) {
    return (
      <View style={[s.done, { backgroundColor: colors.bg }]}>
        <Icon name="check" size={56} color={colors.success} />
        <Text variant="title" style={{ textAlign: 'center' }}>
          Sent to the office.
        </Text>
        <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
          You'll find the answer in Inbox → Requests.
        </Text>
        <View style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { borderBottomColor: colors.separator }]}>
        <TextButton label="Cancel" onPress={() => router.back()} />
        <Text variant="headline" accessibilityRole="header">
          Ask the office
        </Text>
        <View style={{ width: 56 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
        <SampleDataBanner />
        <ChoiceField
          label="School"
          value={schoolId}
          onChange={(v) => {
            setSchoolId(v);
            setChildId('none');
          }}
          options={schools.map((sc) => ({ value: sc.id, label: sc.shortName, dotColor: schoolColors(sc.id, scheme).tint }))}
        />
        {kids.length > 0 && (
          <ChoiceField
            label="About"
            value={childId}
            onChange={setChildId}
            options={[{ value: 'none', label: 'The whole family' }, ...kids.map((c) => ({ value: c.id, label: c.firstName }))]}
          />
        )}
        <ChoiceField label="Type" value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: t }))} />
        <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={120} />
        <Field label="Message" value={body} onChangeText={setBody} multiline hint="Goes to the school office, not to a teacher." />
        {create.isError && (
          <Text variant="subhead" tone="danger" accessibilityRole="alert">
            We couldn't send it. Your message is still here. Try again.
          </Text>
        )}
        <Button
          label="Send to the office"
          icon="send"
          loading={create.isPending}
          disabled={!schoolId || !subject.trim() || !body.trim()}
          onPress={() =>
            create.mutate(
              { schoolId: schoolId!, childId: childId === 'none' ? undefined : childId, type, subject: subject.trim(), body: body.trim() },
              {
                onSuccess: () => {
                  haptic('success');
                  setSent(true);
                },
                onError: () => haptic('error'),
              },
            )
          }
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
