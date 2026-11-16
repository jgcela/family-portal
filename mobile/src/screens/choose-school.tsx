import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Group, haptic, Row, Separator, Text } from '@/components/primitives';
import { schools } from '@/data/sample';
import { useAppState } from '@/state/app-state';
import { brand, spacing } from '@/theme/tokens';
import { schoolColors, useAppTheme } from '@/theme/use-app-theme';

/** School switcher sheet: "All schools" or one school. */
export default function ChooseSchool() {
  const { colors, scheme } = useAppTheme();
  const { schoolFilter, setSchoolFilter } = useAppState();
  const pick = (id: string) => {
    haptic('light');
    setSchoolFilter(id);
    router.back();
  };
  const options = [
    { id: 'all', name: 'All schools', subtitle: 'Everything from every school, together', color: brand.start },
    ...schools.map((s) => ({ id: s.id, name: s.name, subtitle: s.address, color: schoolColors(s.id, scheme).tint })),
  ];
  return (
    <View style={{ backgroundColor: colors.grouped, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: spacing.md }}>
        Show
      </Text>
      <Group>
        {options.map((o, i) => (
          <View key={o.id}>
            {i > 0 && <Separator inset={56} />}
            <Row
              title={o.name}
              subtitle={o.subtitle}
              leading={<View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: o.color }} />}
              trailing={schoolFilter === o.id ? <Icon name="check" color={colors.tint} /> : undefined}
              showChevron={false}
              onPress={() => pick(o.id)}
              accessibilityLabel={`${o.name}${schoolFilter === o.id ? ', selected' : ''}`}
            />
          </View>
        ))}
      </Group>
    </View>
  );
}
