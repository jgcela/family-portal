import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useColorScheme } from 'react-native';

import { ApiError } from '@/services/api';
import { AppStateProvider, useAppState } from '@/state/app-state';

function RootStack() {
  const { auth } = useAppState();
  const scheme = useColorScheme();
  const signedIn = auth === 'signed_in';
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" options={{ headerShown: true, title: 'Sign in', headerBackTitle: 'Back' }} />
          <Stack.Screen name="two-step" options={{ headerShown: true, title: 'Two-step sign-in', headerBackTitle: 'Back' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="report-absence"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.9], sheetGrabberVisible: true, headerShown: false }}
          />
          <Stack.Screen
            name="new-request"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.9], sheetGrabberVisible: true, headerShown: false }}
          />
          <Stack.Screen
            name="choose-school"
            options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, headerShown: false }}
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            // Do not retry when the phone is offline or the item is gone.
            retry: (count, error) => !(error instanceof ApiError && error.kind !== 'network') && count < 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AppStateProvider>
        <RootStack />
      </AppStateProvider>
    </QueryClientProvider>
  );
}
