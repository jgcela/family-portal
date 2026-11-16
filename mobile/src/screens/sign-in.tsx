import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Field } from '@/components/form';
import { Button, haptic, Text, TextButton } from '@/components/primitives';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function SignIn() {
  const { colors } = useAppTheme();
  const { signIn, options } = useAppState();
  const [email, setEmail] = useState('ana.rivera@example.com');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const submit = () => {
    setBusy(true);
    setTimeout(() => {
      const r = signIn(email.trim(), password);
      setBusy(false);
      if (!r.ok) {
        haptic('error');
        setError(r.message);
        return;
      }
      if (options.requireTwoStep) router.push('/two-step');
    }, 500);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
        <Field
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError(null);
          }}
          secureTextEntry={!show}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          hint="Prototype: any password works. Type “wrong” to see the error."
          error={error ?? undefined}
          trailing={<TextButton label={show ? 'Hide' : 'Show'} onPress={() => setShow((v) => !v)} />}
        />
        <Button label="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
        <View style={{ alignItems: 'center' }}>
          <TextButton label="Forgot your password?" onPress={() => setHelp((v) => !v)} />
          {help && (
            <Text variant="subhead" tone="secondary" style={{ textAlign: 'center' }}>
              Contact your school office. They can send you a link to set a new password.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.xl, gap: spacing.lg },
});
