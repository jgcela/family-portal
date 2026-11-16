import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';

/** The stack inside each tab: large title on the tab's first screen, standard titles on details. */
export function TabStack({ rootTitle }: { rootTitle: string }) {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.tint,
        headerTitleStyle: { color: colors.text },
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: Platform.OS === 'android',
        headerStyle: { backgroundColor: colors.grouped },
        headerLargeStyle: { backgroundColor: colors.grouped },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.grouped },
      }}>
      <Stack.Screen name="index" options={{ title: rootTitle, headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
