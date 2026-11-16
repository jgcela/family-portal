import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceField, Field } from '@/components/form';
import { Icon } from '@/components/icon';
import { Button, haptic, SampleDataBanner, Text, TextButton } from '@/components/primitives';
import { children } from '@/data/sample';
import type { AbsenceType } from '@/data/types';
import { dayLabel, isoDate, schoolDay } from '@/lib/dates';
import { absenceTypeLabel, schoolById } from '@/lib/lookup';
import { useSubmitAbsence } from '@/services/queries';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';
import { schoolColors, useAppTheme } from '@/theme/use-app-theme';

const TIMES = ['8:30 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM'];

export default function ReportAbsence() {
  const params = useLocalSearchParams<{ childId?: string }>();
  const { colors, scheme } = useAppTheme();
  const { schoolFilter } = useAppState();
  const submit = useSubmitAbsence();

  const eligible = children.filter((c) => c.canReportAbsence && (schoolFilter === 'all' || c.schoolId === schoolFilter));
  const [childId, setChildId] = useState<string | null>(params.childId ?? (eligible.length === 1 ? eligible[0]!.id : null));
  const [type, setType] = useState<AbsenceType>('absent');
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; out.length < 6; i++) {
      const d = schoolDay(i);
      if (!out.some((x) => isoDate(x) === isoDate(d))) out.push(d);
    }
    return out;
  }, []);
  const [day, setDay] = useState(isoDate(days[0]!));
  const [until, setUntil] = useState(isoDate(days[0]!));
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);

  const needsTime = type !== 'absent';
  const ready = !!childId && (!needsTime || !!timeOfDay);

  const send = () => {
    if (!childId) return;
    submit.mutate(
      { childId, type, dateFrom: day, dateTo: type === 'absent' && until > day ? until : day, time: needsTime ? (timeOfDay ?? undefined) : undefined, reason: reason.trim() },
      {
        onSuccess: (n) => {
          haptic('success');
          setSentId(n.id);
        },
        onError: () => haptic('error'),
      },
    );
  };

  if (sentId) {
    const child = children.find((c) => c.id === childId);
    return (
      <View style={[s.done, { backgroundColor: colors.bg }]} accessibilityLiveRegion="polite">
        <Icon name="check" size={56} color={colors.success} />
        <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
          Sent. The office will see it right away.
        </Text>
        <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
          {child?.firstName}: {absenceTypeLabel[type].toLowerCase()}, {dayLabel(new Date(`${day}T00:00`)).toLowerCase()}. You can follow it in Inbox.
        </Text>
        <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button label="Done" onPress={() => router.back()} />
          <TextButton
            label="See it in Inbox"
            onPress={() => {
              router.back();
              router.push(`/inbox/absence/${sentId}` as never);
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { borderBottomColor: colors.separator }]}>
        <TextButton label="Cancel" onPress={() => router.back()} />
        <Text variant="headline" accessibilityRole="header">
          Report absence
        </Text>
        <View style={{ width: 56 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
        <SampleDataBanner />
        <ChoiceField
          label="Child"
          value={childId}
          onChange={setChildId}
          options={eligible.map((c) => ({ value: c.id, label: c.firstName, dotColor: schoolColors(c.schoolId, scheme).tint }))}
        />
        {childId && (
          <Text variant="footnote" tone="secondary" style={{ marginTop: -spacing.sm }}>
            Goes to {schoolById(children.find((c) => c.id === childId)!.schoolId)?.name}.
          </Text>
        )}
        <ChoiceField
          label="What happened"
          value={type}
          onChange={(t) => {
            setType(t);
            setTimeOfDay(null);
          }}
          options={(['absent', 'late', 'early_pickup'] as const).map((t) => ({ value: t, label: absenceTypeLabel[t] }))}
        />
        <ChoiceField
          label={type === 'absent' ? 'First day' : 'Day'}
          value={day}
          onChange={(d) => {
            setDay(d);
            if (until < d) setUntil(d);
          }}
          options={days.map((d) => ({ value: isoDate(d), label: dayLabel(d) }))}
        />
        {type === 'absent' && (
          <ChoiceField
            label="Last day"
            value={until}
            onChange={setUntil}
            options={days.filter((d) => isoDate(d) >= day).map((d) => ({ value: isoDate(d), label: isoDate(d) === day ? 'Same day' : dayLabel(d) }))}
          />
        )}
        {needsTime && (
          <ChoiceField
            label={type === 'late' ? 'Expected arrival' : 'Pickup time'}
            value={timeOfDay}
            onChange={setTimeOfDay}
            options={TIMES.map((t) => ({ value: t, label: t }))}
          />
        )}
        <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="For example, a doctor's appointment" multiline hint="Only the school office sees this." />
        {submit.isError && (
          <Text variant="subhead" tone="danger" accessibilityRole="alert">
            {submit.error.message} Your report was not sent. Try again.
          </Text>
        )}
        <Button label="Send to the office" onPress={send} loading={submit.isPending} disabled={!ready} />
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
          Report before 8:30 AM when you can.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
