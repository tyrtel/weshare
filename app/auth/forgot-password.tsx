import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { isOk } from '../../src/core/types/Result';
import { getErrorMessage } from '../../src/core/types/AppError';
import { Text } from '../../src/components/ui/Text';
import { useTranslation } from 'react-i18next';
import { useColors } from '../../src/theme/colors';
import { validateAndNormalizeEmail } from '../../src/core/utils/emailValidation';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const auth   = useService(AUTH);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C      = useColors();

  const [email, setEmail] = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const { original, error: emailError } = validateAndNormalizeEmail(email);
    if (emailError === 'invalid_format') { setError(t('auth.error_invalid_email')); return; }

    setBusy(true);
    setError(null);
    const result = await auth.sendPasswordReset(original);
    setBusy(false);

    if (!isOk(result)) {
      setError(getErrorMessage(result.error));
      return;
    }

    router.push(
      `/auth/reset-password?email=${encodeURIComponent(result.value.resolvedEmail)}` as Parameters<typeof router.push>[0],
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.root,
          { backgroundColor: C.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          accessibilityLabel={t('common.go_back')}
        >
          <Text variant="body" color={C.primary.default}>{t('common.back_arrow')}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text variant="heading" style={[styles.title, { color: C.text.primary }]}>{t('auth.forgot_password.title')}</Text>
          <Text variant="body" color={C.text.secondary} style={styles.subtitle}>
            {t('auth.forgot_password.subtitle')}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: C.error.bg }]}>
              <Text variant="caption" color={C.error.default}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            value={email}
            onChangeText={v => { setEmail(v); setError(null); }}
            placeholder={t('auth.email_placeholder_example')}
            placeholderTextColor={C.text.tertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleSend}
            editable={!busy}
            style={[styles.input, { backgroundColor: C.surface, borderColor: C.border, color: C.text.primary }]}
            accessibilityLabel={t('auth.email_accessibility')}
          />

          <Pressable
            onPress={handleSend}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: C.primary.default },
              busy && styles.disabledButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('auth.forgot_password.button_label')}
          >
            {busy
              ? <ActivityIndicator color={C.text.inverse} size="small" />
              : <Text variant="body" color={C.text.inverse} style={styles.buttonLabel}>{t('auth.forgot_password.button')}</Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 22,
  },
  form: {
    gap: 16,
  },
  errorBanner: {
    borderRadius: 8,
    padding: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  buttonLabel: {
    fontWeight: '600',
  },
});
