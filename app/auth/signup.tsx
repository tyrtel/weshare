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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { isOk } from '../../src/core/types/Result';
import { Text } from '../../src/components/ui/Text';
import { useTranslation } from 'react-i18next';
import { ledgerColors as C } from '../../src/theme/colors';
import { validateAndNormalizeEmail } from '../../src/core/utils/emailValidation';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const auth   = useService(AUTH);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef  = useRef<TextInput>(null);

  function validate(): { error: string | null; validEmail: string } {
    if (!name.trim()) return { error: t('auth.sign_up.error_name_empty'), validEmail: '' };

    const { original, error: emailError } = validateAndNormalizeEmail(email);
    if (emailError === 'invalid_format')   return { error: t('auth.error_invalid_email'),    validEmail: '' };
    if (emailError === 'disposable_domain') return { error: t('auth.error_disposable_email'), validEmail: '' };

    if (!password)            return { error: t('auth.sign_up.error_password_empty'), validEmail: '' };
    if (password.length < 6)  return { error: t('auth.error_password_too_short'),    validEmail: '' };
    if (password !== confirm)  return { error: t('auth.error_passwords_mismatch'),    validEmail: '' };

    return { error: null, validEmail: original };
  }

  async function handleCreate() {
    const { error: validationError, validEmail } = validate();
    if (validationError) { setError(validationError); return; }

    setBusy(true);
    setError(null);

    const result = await auth.signUp(validEmail, password, name.trim());
    setBusy(false);

    if (!isOk(result)) {
      setError(result.error.message);
      return;
    }

    if ('needsEmailConfirmation' in result.value) {
      router.push(
        `/auth/verify?email=${encodeURIComponent(validEmail)}&name=${encodeURIComponent(name.trim())}` as Parameters<typeof router.push>[0],
      );
    } else {
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
          <Text style={styles.title}>{t('auth.sign_up.title')}</Text>
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
            <View style={{ position: 'relative' }}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={v => { setPassword(v); setError(null); }}
                placeholder={t('auth.sign_up.password_placeholder')}
                placeholderTextColor={C.text.tertiary}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                editable={!busy}
                style={[styles.input, { paddingRight: 48 }]}
                accessibilityLabel={t('auth.password_accessibility')}
              />
              <Pressable
                onPress={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 4 }}
                hitSlop={8}
                accessibilityLabel={showPassword ? t('auth.hide_password') : t('auth.show_password')}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={C.text.tertiary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <Text variant="label" color={C.text.secondary} style={styles.label}>{t('auth.sign_up.confirm_password_label')}</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                ref={confirmRef}
                value={confirm}
                onChangeText={v => { setConfirm(v); setError(null); }}
                placeholder="••••••••"
                placeholderTextColor={C.text.tertiary}
                secureTextEntry={!showConfirm}
                returnKeyType="go"
                onSubmitEditing={handleCreate}
                editable={!busy}
                style={[styles.input, { paddingRight: 48 }]}
                accessibilityLabel={t('auth.sign_up.confirm_password_accessibility')}
              />
              <Pressable
                onPress={() => setShowConfirm(v => !v)}
                style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 4 }}
                hitSlop={8}
                accessibilityLabel={showConfirm ? t('auth.hide_password') : t('auth.show_password')}
              >
                <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color={C.text.tertiary} />
              </Pressable>
            </View>
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
