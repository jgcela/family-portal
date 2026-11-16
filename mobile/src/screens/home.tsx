import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AnnouncementRow, ChildChip, EventRow, QuickAction } from '@/components/family-ui';
import { Icon } from '@/components/icon';
import { Group, Screen, Section, Separator, Text } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { daysBetween, greeting, isoDate } from '@/lib/dates';
import { useOpen } from '@/lib/nav';
import { useAbsences, useAnnouncements, useEvents, useFamily } from '@/services/queries';
import { useAppState } from '@/state/app-state';
import { spacing, touchTarget } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function Home() {
  const { colors } = useAppTheme();
  const { selectedSchool, schoolFilter, readIds, askAvailable } = useAppState();
  const open = useOpen();
  const family = useFamily();
  const events = useEvents();
  const announcements = useAnnouncements();
  const absences = useAbsences();

  const now = new Date();
  const { today, week } = useMemo(() => {
    const list = (events.data ?? []).filter((e) => !e.cancelled || daysBetween(now, new Date(e.start)) >= 0);
    return {
      today: list.filter((e) => daysBetween(now, new Date(e.start)) <= 0 && daysBetween(now, new Date(e.end)) >= 0),
      week: list.filter((e) => {
        const d = daysBetween(now, new Date(e.start));
        return d >= 1 && d <= 7;
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.data]);

  const important = (announcements.data ?? []).find((a) => a.important && !readIds.has(a.id));
  const kids = (family.data?.children ?? []).filter((c) => schoolFilter === 'all' || c.schoolId === schoolFilter);
  const todayIso = isoDate(now);
  const absentToday = new Set((absences.data ?? []).filter((a) => a.status !== 'cancelled' && a.dateFrom <= todayIso && a.dateTo >= todayIso).map((a) => a.childId));
  const multiSchool = (family.data?.schools.length ?? 0) > 1;

  const refresh = () => {
    void events.refetch();
    void announcements.refetch();
    void absences.refetch();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: `${greeting()}, ${family.data?.greetingName ?? ''}`.trim(),
          headerRight: () => (
            <Pressable
              onPress={() => open('notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={8}
              style={{ minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bell" color={colors.tint} />
            </Pressable>
          ),
        }}
      />
      <Screen refreshing={events.isRefetching} onRefresh={refresh}>
        {multiSchool && (
          <Pressable
            onPress={() => router.push('/choose-school')}
            accessibilityRole="button"
            accessibilityLabel={`Showing ${selectedSchool?.name ?? 'all schools'}. Change school`}
            style={[s.switcher, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            <Icon name="school" size={18} color={colors.tint} />
            <Text variant="subhead" style={{ fontWeight: '600' }}>
              {selectedSchool?.name ?? 'All schools'}
            </Text>
            <Icon name="chevronDown" size={14} color={colors.textSecondary} />
          </Pressable>
        )}

        {important && (
          <Section>
            <Group>
              <AnnouncementRow item={important} showSchool={schoolFilter === 'all'} onPress={() => open(`announcement/${important.id}`)} />
            </Group>
          </Section>
        )}

        <Section title="Your children">
          <QueryView query={family} skeletonRows={1}>
            {() =>
              kids.length === 0 ? (
                <Text variant="subhead" tone="secondary">
                  No children are linked to your account at this school. Contact the office to link them.
                </Text>
              ) : kids.length === 1 ? (
                <ChildChip wide child={kids[0]!} indicator={absentToday.has(kids[0]!.id) ? 'Absence reported today' : undefined} onPress={() => open(`child/${kids[0]!.id}`)} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
                  {kids.map((c) => (
                    <ChildChip key={c.id} child={c} indicator={absentToday.has(c.id) ? 'Absence reported today' : undefined} onPress={() => open(`child/${c.id}`)} />
                  ))}
                </ScrollView>
              )
            }
          </QueryView>
        </Section>

        <Section title="Today">
          <QueryView query={events} skeletonRows={2}>
            {() =>
              today.length === 0 ? (
                <Group>
                  <Text variant="subhead" tone="secondary" style={{ padding: spacing.lg }}>
                    Nothing on the calendar today.
                  </Text>
                </Group>
              ) : (
                <Group>
                  {today.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <Separator />}
                      <EventRow event={e} showSchool={schoolFilter === 'all'} onPress={() => open(`event/${e.id}`)} />
                    </View>
                  ))}
                </Group>
              )
            }
          </QueryView>
        </Section>

        <Section title="This week" action={{ label: 'See all', onPress: () => router.push('/calendar') }}>
          <QueryView query={events} skeletonRows={3}>
            {() =>
              week.length === 0 ? (
                <Group>
                  <EmptyState icon="calendar" title="Nothing on the calendar this week." />
                </Group>
              ) : (
                <Group>
                  {week.slice(0, 5).map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <Separator />}
                      <EventRow event={e} showSchool={schoolFilter === 'all'} onPress={() => open(`event/${e.id}`)} />
                    </View>
                  ))}
                </Group>
              )
            }
          </QueryView>
        </Section>

        <Section title="Quick actions">
          <View style={s.grid}>
            <QuickAction icon="absence" label="Report absence" onPress={() => router.push('/report-absence')} />
            {askAvailable ? (
              <QuickAction icon="ask" label="Ask a question" onPress={() => router.push('/ask')} />
            ) : (
              <QuickAction icon="calendar" label="Calendar" onPress={() => router.push('/calendar')} />
            )}
            <QuickAction icon="document" label="Documents" onPress={() => router.push('/family/documents')} />
          </View>
          <View style={[s.grid, { marginTop: spacing.sm }]}>
            <QuickAction icon="phone" label="Contact school" onPress={() => router.push('/family/contact')} />
            <QuickAction icon="mail" label="Ask the office" onPress={() => router.push('/new-request')} />
            <QuickAction icon="volunteer" label="Volunteer" onPress={() => router.push('/family/volunteer')} />
          </View>
        </Section>
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid: { flexDirection: 'row', gap: spacing.sm },
});
