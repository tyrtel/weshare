import React, { useState, useRef } from 'react';
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
import { Text } from '../../src/components/ui/Text';
import { useTranslation } from 'react-i18next';
import { darkColors as C } from '../../src/theme/colors';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const auth   = useService(AUTH);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef  = useRef<TextInput>(null);

  function validate(): string | null {
    if (!name.trim())               return t('auth.sign_up.error_name_empty');
    if (!email.trim())              return t('auth.sign_in.error_email_empty');
    if (!email.includes('@'))       return t('auth.error_invalid_email');
    if (!password)                  return t('auth.sign_up.error_password_empty');
    if (password.length < 6)        return t('auth.error_password_too_short');
    if (password !== confirm)       return t('auth.error_passwords_mismatch');
    return null;
  }

  async function handleCreate() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setBusy(true);
    setError(null);

    const result = await auth.signUp(email.trim(), password, name.trim());
    setBusy(false);

    if (!isOk(result)) {
      setError(result.error.message);
      return;
    }

    if ('needsEmailConfirmation' in result.value) {
      // Navigate to OTP screen, carrying email and name so verifyOtp can use them
      router.push(
        `/auth/verify?email=${encodeURIComponent(email.trim())}&name=${encodeURIComponent(name.trim())}` as Parameters<typeof router.push>[0],
      );
    } else {
      // Email confirmation is disabled in Supabase — signed in directly
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
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
          <Text variant="heading" style={styles.title}>{t('auth.sign_up.title')}</Text>
          <Text variant="body" color={C.text.secondary}>
            {t('auth.sign_up.subtitle')}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text variant="caption" color={C.error.default}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text variant="label" color={C.text.secondary} style={styles.label}>{t('auth.sign_up.name_label')}</Text>
            <TextInput
              value={name}
              onChangeText={v => { setName(v); setError(null); }}
              placeholder={t('auth.sign_up.name_placeholder')}
              placeholderTextColor={C.text.tertiary}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!busy}
              style={styles.input}
              accessibilityLabel={t('auth.sign_up.name_accessibility')}
            />
          </View>

          <View style={styles.field}>
            <Text variant="label" color={C.text.secondary} style={styles.label}>{t('auth.sign_up.email_label')}</Text>
            <TextInput
              ref={emailRef}
              value={email}
              onChangeText={v => { setEmail(v); setError(null); }}
              placeholder={t('auth.email_placeholder_example')}
              placeholderTextColor={C.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!busy}
              style={styles.input}
              accessibilityLabel={t('auth.email_accessibility')}
            />
          </View>

          <View style={styles.field}>
            <Text variant="label" color={C.text.secondary} style={styles.label}>{t('auth.sign_up.password_label')}</Text>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={v => { setPassword(v); setError(null); }}
              placeholder={t('auth.sign_up.password_placeholder')}
              placeholderTextColor={C.text.tertiary}
              secureTextEntry
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              editable={!busy}
              style={styles.input}
              accessibilityLabel={t('auth.password_accessibility')}
            />
          </View>

          <View style={styles.field}>
            <Text variant="label" color={C.text.secondary} style={styles.label}>{t('auth.sign_up.confirm_password_label')}</Text>
            <TextInput
              ref={confirmRef}
              value={confirm}
              onChangeText={v => { setConfirm(v); setError(null); }}
              placeholder="••••••••"
              placeholderTextColor={C.text.tertiary}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={handleCreate}
              editable={!busy}
              style={styles.input}
              accessibilityLabel={t('auth.sign_up.confirm_password_accessibility')}
            />
          </View>

          <Pressable
            onPress={handleCreate}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryButton,
              busy && styles.disabledButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('auth.sign_up.button_label')}
          >
            {busy
              ? <ActivityIndicator color={C.text.inverse} size="small" />
              : <Text variant="body" color={C.text.inverse} style={styles.buttonLabel}>{t('auth.sign_up.button')}</Text>
            }
          </Pressable>
        </View>

        <View style={styles.signInRow}>
          <Text variant="body" color={C.text.secondary}>{t('auth.sign_up.has_account')}</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text variant="body" color={C.primary.default} style={styles.signInLink}>{' '}{t('auth.sign_up.sign_in_link')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: C.background,
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
    color: C.text.primary,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: C.error.bg,
    borderRadius: 8,
    padding: 12,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text.primary,
  },
  primaryButton: {
    backgroundColor: C.primary.default,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInLink: {
    fontWeight: '600',
  },
});
