// Loading, empty, error and offline states, plus QueryView, which picks the
// right one for a TanStack Query result.

import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/services/api';
import { spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

import { Icon, type IconName } from './icon';
import { Button, Group, Separator, Text } from './primitives';

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const { colors } = useAppTheme();
  return (
    <View style={s.center} accessibilityRole="summary">
      <Icon name={icon} size={36} color={colors.textSecondary} />
      <Text variant="headline" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text variant="subhead" tone="secondary" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: spacing.sm, alignSelf: 'stretch' }}>
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const offline = error instanceof ApiError && error.kind === 'offline';
  const notFound = error instanceof ApiError && error.kind === 'not_found';
  return (
    <EmptyState
      icon={offline ? 'offline' : 'error'}
      title={offline ? "You're offline" : notFound ? 'This is no longer available' : "We couldn't load this"}
      body={offline ? 'Connect to Wi-Fi or cellular data and try again.' : notFound ? 'The school may have removed it.' : 'Check your connection and try again.'}
      action={notFound ? undefined : { label: 'Try again', onPress: onRetry }}
    />
  );
}

/** Shows nothing for the first 300 ms, then gray placeholder rows. */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return <View style={{ height: 120 }} />;
  return (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Group>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i}>
            {i > 0 && <Separator />}
            <View style={s.skelRow}>
              <View style={[s.skelCircle, { backgroundColor: colors.skeleton }]} />
              <View style={{ flex: 1, gap: 8 }}>
                <View style={[s.skelLine, { width: '70%', backgroundColor: colors.skeleton }]} />
                <View style={[s.skelLine, { width: '45%', backgroundColor: colors.skeleton }]} />
              </View>
            </View>
          </View>
        ))}
      </Group>
    </View>
  );
}

export function QueryView<T>({ query, children, skeletonRows }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; skeletonRows?: number }) {
  if (query.data !== undefined) {
    // Keep showing what we already have; a failed refresh only adds the offline banner.
    const offline = query.error instanceof ApiError && query.error.kind === 'offline';
    return (
      <>
        {offline && <OfflineBanner />}
        {children(query.data)}
      </>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <LoadingSkeleton rows={skeletonRows} />;
}

export function OfflineBanner() {
  const { colors } = useAppTheme();
  return (
    <View style={[s.offline, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="alert">
      <Icon name="offline" size={16} color={colors.textSecondary} />
      <Text variant="footnote" tone="secondary">
        You're offline. Showing what was saved on this phone.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl * 1.5 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  skelCircle: { width: 36, height: 36, borderRadius: 18 },
  skelLine: { height: 12, borderRadius: 6 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: 10 },
});
