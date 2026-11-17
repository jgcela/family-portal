import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AnnouncementRow, StatusRow } from '@/components/family-ui';
import { Chip, ChipRow, Group, Screen, Section, Separator, TextButton } from '@/components/primitives';
import { EmptyState, QueryView } from '@/components/states';
import { relative } from '@/lib/dates';
import { absenceStatusLabel, absenceTypeLabel, absenceWhen, childById, requestStatusLabel } from '@/lib/lookup';
import { useOpen } from '@/lib/nav';
import { useAbsences, useAnnouncements, useRequests } from '@/services/queries';
import { useAppState } from '@/state/app-state';

type Filter = 'all' | 'announcements' | 'requests' | 'absences';

export default function Inbox() {
  const [filter, setFilter] = useState<Filter>('all');
  const { schoolFilter, readIds } = useAppState();
  const open = useOpen();
  const announcements = useAnnouncements();
  const requests = useRequests();
  const absences = useAbsences();
  const showSchool = schoolFilter === 'all';
  const unread = (announcements.data ?? []).filter((a) => !readIds.has(a.id)).length;

  const refresh = () => {
    void announcements.refetch();
    void requests.refetch();
    void absences.refetch();
  };

  const show = (f: Filter) => filter === 'all' || filter === f;

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <TextButton label="New request" onPress={() => router.push('/new-request')} /> }} />
      <Screen refreshing={announcements.isRefetching} onRefresh={refresh}>
        <ChipRow>
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={unread ? `Announcements (${unread})` : 'Announcements'} selected={filter === 'announcements'} onPress={() => setFilter('announcements')} />
          <Chip label="Requests" selected={filter === 'requests'} onPress={() => setFilter('requests')} />
          <Chip label="Absences" selected={filter === 'absences'} onPress={() => setFilter('absences')} />
        </ChipRow>

        {show('announcements') && (
          <Section title="Announcements">
            <QueryView query={announcements} skeletonRows={3}>
              {(items) =>
                items.length === 0 ? (
                  <Group>
                    <EmptyState icon="inbox" title="You're all caught up." body="New announcements from your school will appear here." />
                  </Group>
                ) : (
                  <Group>
                    {items.map((a, i) => (
                      <View key={a.id}>
                        {i > 0 && <Separator inset={26} />}
                        <AnnouncementRow item={a} showSchool={showSchool} onPress={() => open(`announcement/${a.id}`)} />
                      </View>
                    ))}
                  </Group>
                )
              }
            </QueryView>
          </Section>
        )}

        {show('requests') && (
          <Section title="Requests to the office">
            <QueryView query={requests} skeletonRows={2}>
              {(items) =>
                items.length === 0 ? (
                  <Group>
                    <EmptyState icon="mail" title="No requests yet." action={{ label: 'Send a question to the office', onPress: () => router.push('/new-request') }} />
                  </Group>
                ) : (
                  <Group>
                    {items.map((r, i) => (
                      <View key={r.id}>
                        {i > 0 && <Separator inset={66} />}
                        <StatusRow
                          title={r.subject}
                          subtitle={`${r.type} · ${relative(new Date(r.createdAt))}`}
                          status={r.status}
                          statusLabel={requestStatusLabel[r.status]}
                          childId={r.childId}
                          onPress={() => open(`request/${r.id}`)}
                        />
                      </View>
                    ))}
                  </Group>
                )
              }
            </QueryView>
          </Section>
        )}

        {show('absences') && (
          <Section title="Absence reports">
            <QueryView query={absences} skeletonRows={2}>
              {(items) =>
                items.length === 0 ? (
                  <Group>
                    <EmptyState icon="absence" title="No absence reports." action={{ label: 'Report absence', onPress: () => router.push('/report-absence') }} />
                  </Group>
                ) : (
                  <Group>
                    {items.map((a, i) => (
                      <View key={a.id}>
                        {i > 0 && <Separator inset={66} />}
                        <StatusRow
                          title={`${childById(a.childId)?.firstName ?? ''}: ${absenceTypeLabel[a.type]}`}
                          subtitle={absenceWhen(a)}
                          status={a.status}
                          statusLabel={absenceStatusLabel[a.status]}
                          childId={a.childId}
                          onPress={() => open(`absence/${a.id}`)}
                        />
                      </View>
                    ))}
                  </Group>
                )
              }
            </QueryView>
          </Section>
        )}
      </Screen>
    </>
  );
}
