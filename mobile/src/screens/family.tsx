import { router } from 'expo-router';
import { View } from 'react-native';

import { Initial } from '@/components/family-ui';
import { Group, Row, Screen, Section, Separator } from '@/components/primitives';
import { QueryView } from '@/components/states';
import { schoolById } from '@/lib/lookup';
import { useOpen } from '@/lib/nav';
import { useFamily } from '@/services/queries';
import { useAppState } from '@/state/app-state';

export default function Family() {
  const family = useFamily();
  const { schoolFilter, selectedSchool } = useAppState();
  const open = useOpen();

  return (
    <Screen>
      <Section title="Children">
        <QueryView query={family} skeletonRows={2}>
          {(f) => {
            const kids = f.children.filter((c) => schoolFilter === 'all' || c.schoolId === schoolFilter);
            return (
              <Group>
                {kids.map((c, i) => (
                  <View key={c.id}>
                    {i > 0 && <Separator inset={72} />}
                    <Row
                      leading={<Initial child={c} size={40} />}
                      title={`${c.firstName} ${c.lastName}`}
                      subtitle={`${c.grade} · ${schoolById(c.schoolId)?.shortName ?? ''}`}
                      onPress={() => open(`child/${c.id}`)}
                    />
                  </View>
                ))}
              </Group>
            );
          }}
        </QueryView>
      </Section>

      <Section title="School">
        <Group>
          <Row icon="document" title="Documents" onPress={() => open('documents')} />
          <Separator inset={50} />
          <Row icon="link" title="Quick links" subtitle="FACTS and other school sites" onPress={() => open('links')} />
          <Separator inset={50} />
          <Row icon="volunteer" title="Volunteer" onPress={() => open('volunteer')} />
          <Separator inset={50} />
          <Row icon="heart" title="Community" subtitle="Teacher wish lists" onPress={() => open('community')} />
          <Separator inset={50} />
          <Row icon="phone" title="Contact school" onPress={() => open('contact')} />
          {(family.data?.schools.length ?? 0) > 1 && (
            <>
              <Separator inset={50} />
              <Row icon="school" title="Showing" detail={selectedSchool?.shortName ?? 'All schools'} onPress={() => router.push('/choose-school')} />
            </>
          )}
        </Group>
      </Section>

      <Section title="Account">
        <Group>
          <Row icon="settings" title="Settings" subtitle={family.data?.email} onPress={() => open('settings')} />
        </Group>
      </Section>
    </Screen>
  );
}
