import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Field } from '@/components/form';
import { Button, haptic, Text, TextButton } from '@/components/primitives';
import { useAppState } from '@/state/app-state';
import { spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function TwoStep() {
  const { colors } = useAppTheme();
  const { verifyTwoStep } = useAppState();
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const r = verifyTwoStep(code);
    if (!r.ok) {
      haptic('error');
      setError(r.message);
    } else haptic('success');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
        <Text variant="body" tone="secondary">
          {backup
            ? 'Enter one of the backup codes you saved when you turned on two-step sign-in. Each code works once.'
            : 'Open your authenticator app and enter the 6-digit code for FAMITENLY.'}
        </Text>
        <Field
          label={backup ? 'Backup code' : 'Code'}
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setError(null);
          }}
          keyboardType={backup ? 'default' : 'number-pad'}
          autoCapitalize="none"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={backup ? 12 : 6}
          autoFocus
          error={error ?? undefined}
          hint={backup ? undefined : 'Prototype: any 6 digits work except 000000.'}
        />
        <Button label="Verify" onPress={submit} disabled={code.length < 6} />
        <TextButton
          label={backup ? 'Use the authenticator app instead' : 'Use a backup code'}
          onPress={() => {
            setBackup((v) => !v);
            setCode('');
            setError(null);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({ body: { padding: spacing.xl, gap: spacing.lg } });
