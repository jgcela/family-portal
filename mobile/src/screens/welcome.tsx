import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SampleDataBanner, Text } from '@/components/primitives';
import { brand, spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function Welcome() {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.bg }]}>
      <SampleDataBanner />
      <View style={s.center}>
        <View style={[s.mark, { backgroundColor: brand.start }]} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={s.markLetter}>F</Text>
        </View>
        <Text variant="largeTitle" accessibilityRole="header" style={{ letterSpacing: 2, color: brand.ink }}>
          FAMITENLY
        </Text>
        <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
          Everything your school family needs. One intelligent place.
        </Text>
      </View>
      <View style={s.actions}>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
          Use the same email and password as your school's family portal. New to your school? Ask the office for the family code, then join on the web.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mark: { width: 88, height: 88, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  markLetter: { color: '#FFFFFF', fontSize: 52, lineHeight: 60, fontWeight: '800' },
  actions: { gap: spacing.lg, paddingBottom: spacing.xl },
});
