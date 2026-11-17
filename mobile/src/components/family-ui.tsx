// Domain components: children, events, announcements, statuses, quick actions
// and assistant sources.

import { Pressable, StyleSheet, View } from 'react-native';

import type { AbsenceStatus, Announcement, Child, RequestStatus, SchoolEvent, Source } from '@/data/types';
import { relative, time } from '@/lib/dates';
import { childById, eventAudience, schoolById } from '@/lib/lookup';
import { useAppState } from '@/state/app-state';
import { spacing, touchTarget } from '@/theme/tokens';
import { schoolColors, useAppTheme } from '@/theme/use-app-theme';

import { Icon, type IconName } from './icon';
import { Tag, Text } from './primitives';

// ---------- Children ----------

export function Initial({ child, size = 44 }: { child: Child; size?: number }) {
  const { scheme } = useAppTheme();
  const { tint } = schoolColors(child.schoolId, scheme);
  return (
    <View style={[s.initial, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint }]}>
      <Text variant={size > 50 ? 'title' : 'headline'} style={{ color: '#FFFFFF' }}>
        {child.firstName.slice(0, 1)}
      </Text>
    </View>
  );
}

export function ChildChip({ child, indicator, onPress, wide }: { child: Child; indicator?: string; onPress: () => void; wide?: boolean }) {
  const { colors, radius } = useAppTheme();
  const school = schoolById(child.schoolId);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${child.firstName}, ${child.grade}, ${school?.shortName ?? ''}${indicator ? `, ${indicator}` : ''}`}
      style={({ pressed }) => [
        s.childChip,
        { backgroundColor: colors.surface, borderRadius: radius, opacity: pressed ? 0.7 : 1 },
        wide ? { flex: 1 } : { width: 172 },
      ]}>
      <Initial child={child} />
      <View style={{ flex: 1 }}>
        <Text variant="headline" numberOfLines={1}>
          {child.firstName}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {child.grade}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {school?.shortName}
        </Text>
        {indicator ? (
          <Text variant="caption" tone="warning" numberOfLines={1}>
            {indicator}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------- Events ----------

export function EventRow({ event, onPress, showSchool }: { event: SchoolEvent; onPress: () => void; showSchool: boolean }) {
  const { colors, scheme } = useAppTheme();
  const start = new Date(event.start);
  const { tint } = schoolColors(event.schoolId, scheme);
  const audience = event.childIds.length ? eventAudience(event) : showSchool ? (schoolById(event.schoolId)?.shortName ?? '') : '';
  const noSchool = event.category === 'no-school';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.cancelled ? 'Cancelled. ' : ''}${event.title}, ${event.allDay ? 'all day' : time(start)}${audience ? `, for ${audience}` : ''}`}
      style={({ pressed }) => [s.eventRow, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <View style={[s.eventBar, { backgroundColor: noSchool ? colors.warning : tint }]} />
      <View style={{ width: 64 }}>
        <Text variant="subhead" tone={event.cancelled ? 'secondary' : 'primary'} style={{ fontWeight: '600' }}>
          {event.allDay ? 'All day' : time(start)}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          variant="body"
          tone={event.cancelled ? 'secondary' : 'primary'}
          style={event.cancelled ? { textDecorationLine: 'line-through' } : undefined}
          numberOfLines={2}>
          {event.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {event.cancelled && <Text variant="caption" tone="danger">Cancelled</Text>}
          {audience ? <Tag label={audience} color={tint} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------- Announcements ----------

export function AnnouncementRow({ item, onPress, showSchool }: { item: Announcement; onPress: () => void; showSchool: boolean }) {
  const { colors, scheme } = useAppTheme();
  const { readIds } = useAppState();
  const unread = !readIds.has(item.id);
  const school = schoolById(item.schoolId);
  const { accent } = schoolColors(item.schoolId, scheme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.important ? 'Important. ' : ''}${item.title}, ${school?.shortName}, ${relative(new Date(item.publishedAt))}`}
      style={({ pressed }) => [s.annRow, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <View style={[s.unreadDot, { backgroundColor: unread ? accent : 'transparent' }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="headline" style={{ flex: 1, fontWeight: unread ? '700' : '500' }} numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="footnote" tone="secondary">
            {relative(new Date(item.publishedAt))}
          </Text>
        </View>
        <Text variant="subhead" tone="secondary" numberOfLines={2}>
          {item.body}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          {item.important && <Text variant="caption" tone="danger">Important</Text>}
          {showSchool && school ? <Tag label={school.shortName} color={accent} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------- Statuses ----------

type AnyStatus = AbsenceStatus | RequestStatus;

export function StatusLabel({ status, label }: { status: AnyStatus; label: string }) {
  const tone = status === 'recorded' || status === 'answered' ? 'success' : status === 'cancelled' || status === 'closed' ? 'secondary' : 'warning';
  return (
    <Text variant="caption" tone={tone}>
      {label}
    </Text>
  );
}

export function StatusRow({
  title,
  subtitle,
  status,
  statusLabel,
  childId,
  onPress,
}: {
  title: string;
  subtitle: string;
  status: AnyStatus;
  statusLabel: string;
  childId?: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const child = childId ? childById(childId) : undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}, ${statusLabel}`}
      style={({ pressed }) => [s.statusRow, pressed && { backgroundColor: colors.surfaceMuted }]}>
      {child ? <Initial child={child} size={36} /> : <Icon name="mail" color={colors.tint} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="footnote" tone="secondary">
          {subtitle}
        </Text>
      </View>
      <StatusLabel status={status} label={statusLabel} />
    </Pressable>
  );
}

// ---------- Quick actions ----------

export function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors, radius } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.quick, { backgroundColor: colors.surface, borderRadius: radius, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} color={colors.tint} size={24} />
      <Text variant="footnote" style={{ textAlign: 'center', fontWeight: '600' }} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- Assistant sources ----------

const sourceIcon: Record<Source['type'], IconName> = { event: 'event', announcement: 'inbox', document: 'document', contact: 'phone' };

export function SourceChip({ source, onPress }: { source: Source; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`Source: ${source.title}`}
      style={({ pressed }) => [s.source, { borderColor: colors.separator, backgroundColor: pressed ? colors.surfaceMuted : colors.surface }]}>
      <Icon name={sourceIcon[source.type]} size={16} color={colors.tint} />
      <Text variant="footnote" tone="tint" numberOfLines={1} style={{ flexShrink: 1, fontWeight: '600' }}>
        {source.title}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  initial: { alignItems: 'center', justifyContent: 'center' },
  childChip: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, alignItems: 'center' },
  eventRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, paddingRight: spacing.lg, minHeight: touchTarget + 8, alignItems: 'flex-start' },
  eventBar: { width: 4, alignSelf: 'stretch', borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  annRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md, paddingRight: spacing.lg, paddingLeft: spacing.sm },
  unreadDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: touchTarget + 8 },
  quick: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.sm },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, maxWidth: '100%', minHeight: 36 },
});
