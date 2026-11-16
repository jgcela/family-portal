// Form fields with a visible label above, hint and error below.
// Errors are announced to screen readers and never blame the user.

import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { spacing, touchTarget, type as typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

import { Chip, ChipRow, Text } from './primitives';

export function Field({
  label,
  hint,
  error,
  trailing,
  multiline,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string; trailing?: ReactNode }) {
  const { colors, radius } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="subhead" style={{ fontWeight: '600' }}>
        {label}
      </Text>
      <View
        style={[
          s.box,
          {
            backgroundColor: colors.surfaceMuted,
            borderRadius: Math.min(radius, 12),
            borderColor: error ? colors.danger : 'transparent',
            minHeight: multiline ? 110 : touchTarget + 6,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textSecondary}
          style={[typeScale.body, { flex: 1, color: colors.text, paddingVertical: spacing.md, textAlignVertical: multiline ? 'top' : 'center' }]}
          multiline={multiline}
          maxFontSizeMultiplier={2}
          {...input}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled set of chips where exactly one is chosen. */
export function ChoiceField<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; dotColor?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 2 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="subhead" style={{ fontWeight: '600' }}>
        {label}
      </Text>
      <View style={{ marginHorizontal: -spacing.lg }}>
        <ChipRow>
          {options.map((o) => (
            <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} dotColor={o.dotColor} />
          ))}
        </ChipRow>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1.5 },
});
