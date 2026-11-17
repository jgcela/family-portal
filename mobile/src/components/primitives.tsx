// Base building blocks. Lists are grouped like iOS Settings and Calendar:
// no shadows, no card grid; layers are separated by background color and hairlines.

import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { spacing, touchTarget, type as typeScale, type TypeVariant } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

import { Icon, type IconName } from './icon';

// ---------- Text ----------

type Tone = 'primary' | 'secondary' | 'tint' | 'danger' | 'success' | 'warning';

export function Text({
  variant = 'body',
  tone = 'primary',
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const { colors } = useAppTheme();
  const color = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tint: colors.tint,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
  }[tone];
  return <RNText maxFontSizeMultiplier={2} style={[typeScale[variant] as TextStyle, { color }, style]} {...rest} />;
}

// ---------- Screen ----------

/** Scrollable screen body that works with native large titles and safe areas. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  grouped = true,
  contentStyle,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  grouped?: boolean;
  contentStyle?: ViewStyle;
}) {
  const { colors } = useAppTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: grouped ? colors.grouped : colors.bg }}
      contentContainerStyle={[{ paddingBottom: spacing.xxl * 2 }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.tint} /> : undefined}>
      <SampleDataBanner />
      {children}
    </ScrollView>
  );
}

/** Fixed reminder that the prototype shows invented data. */
export function SampleDataBanner() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.sample, { backgroundColor: colors.banner }]} accessibilityRole="text">
      <RNText style={[typeScale.caption as TextStyle, { color: colors.bannerText }]}>Sample data — not real students</RNText>
    </View>
  );
}

// ---------- Sections and grouped lists ----------

export function Section({
  title,
  action,
  footer,
  children,
}: {
  title?: string;
  action?: { label: string; onPress: () => void };
  footer?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {(title || action) && (
        <View style={styles.sectionHeader}>
          {title ? (
            <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {action && <TextButton label={action.label} onPress={action.onPress} />}
        </View>
      )}
      {children}
      {footer && (
        <Text variant="footnote" tone="secondary" style={styles.sectionFooter}>
          {footer}
        </Text>
      )}
    </View>
  );
}

export function Group({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors, radius } = useAppTheme();
  return <View style={[styles.group, { backgroundColor: colors.surface, borderRadius: radius }, style]}>{children}</View>;
}

export function Separator({ inset = spacing.lg }: { inset?: number }) {
  const { colors } = useAppTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: inset }} />;
}

/** One row in a grouped list. Rows with onPress show a chevron and are at least 44 pt tall. */
export function Row({
  title,
  subtitle,
  detail,
  icon,
  leading,
  trailing,
  onPress,
  bold,
  destructive,
  accessibilityLabel,
  accessibilityHint,
  showChevron = true,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  icon?: IconName;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  bold?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  showChevron?: boolean;
}) {
  const { colors } = useAppTheme();
  const content = (
    <View style={styles.row}>
      {leading ?? (icon ? <Icon name={icon} color={destructive ? colors.danger : colors.tint} size={22} /> : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={bold ? 'headline' : 'body'} tone={destructive ? 'danger' : 'primary'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subhead" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Text variant="subhead" tone="secondary">
          {detail}
        </Text>
      ) : null}
      {trailing}
      {onPress && showChevron && !destructive ? <Icon name="chevron" size={14} color={colors.textSecondary} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, detail].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => [pressed && Platform.OS === 'ios' ? { backgroundColor: colors.surfaceMuted } : null]}>
      {content}
    </Pressable>
  );
}

// ---------- Buttons and chips ----------

export function haptic(kind: 'success' | 'error' | 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  accessibilityHint?: string;
}) {
  const { colors, radius } = useAppTheme();
  const bg = variant === 'primary' ? colors.tint : variant === 'destructive' ? colors.danger : colors.surfaceMuted;
  const fg = variant === 'secondary' ? colors.tint : variant === 'destructive' ? '#FFFFFF' : colors.onTint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderRadius: Math.min(radius, 14), opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <RNText maxFontSizeMultiplier={1.6} style={[typeScale.headline as TextStyle, { color: fg }]}>
            {label}
          </RNText>
        </>
      )}
    </Pressable>
  );
}

export function TextButton({ label, onPress, tone = 'tint' }: { label: string; onPress: () => void; tone?: Tone }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={12} style={{ minHeight: touchTarget, justifyContent: 'center', alignItems: 'center' }}>
      <Text variant="subhead" tone={tone} style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, dotColor }: { label: string; selected: boolean; onPress: () => void; dotColor?: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.tint : colors.surface, borderColor: selected ? colors.tint : colors.separator },
      ]}>
      {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
      <RNText maxFontSizeMultiplier={1.6} style={[typeScale.subhead as TextStyle, { color: selected ? colors.onTint : colors.text, fontWeight: '600' }]}>
        {label}
      </RNText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}

/** Small colored tag with a school or child name. */
export function Tag({ label, color }: { label: string; color: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.tag, { borderColor: colors.separator }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  sample: { alignSelf: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 999 },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget, marginBottom: spacing.xs },
  sectionFooter: { marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  group: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: touchTarget + 8 },
  button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
});
