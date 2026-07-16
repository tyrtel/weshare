import React, { useState, useRef, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { isOk } from '../../src/core/types/Result';
import { Text } from '../../src/components/ui/Text';
import { useTranslation } from 'react-i18next';
import { useColors } from '../../src/theme/colors';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { t } = useTranslation();
  const auth   = useService(AUTH);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C      = useColors();

  const { email = '', name = '' } = useLocalSearchParams<{ email: string; name: string }>();

  const [digits, setDigits]   = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [resent, setResent]   = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>(Array(CODE_LENGTH).fill(null));

  // Auto-focus first box on mount
  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  function handleDigit(index: number, value: string) {
    // Strip anything that isn't a digit; take only the last character typed
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(null);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && next.every(d => d !== '')) {
      void submit(next.join(''));
    }
  }

  function handleKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  }

  // Handle paste: if user pastes a 6-digit string into any box
  function handlePaste(index: number, value: string) {
    const pasted = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (pasted.length === CODE_LENGTH) {
      const next = pasted.split('');
      setDigits(next);
      inputRefs.current[CODE_LENGTH - 1]?.focus();
      void submit(pasted);
    } else {
      handleDigit(index, value);
    }
  }

  async function submit(code: string) {
    setBusy(true);
    setError(null);
    const result = await auth.verifyOtp(email, code, name);
    setBusy(false);

    if (!isOk(result)) {
      setError(result.error.message);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } else {
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }

  async function handleResend() {
    setBusy(true);
    setError(null);
    const result = await auth.resendOtp(email);
    setBusy(false);
    if (isOk(result)) {
      setResent(true);
    } else {
      setError(result.error.message);
    }
  }

  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH;

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
          <Text variant="heading" style={[styles.title, { color: C.text.primary }]}>{t('auth.verify.title')}</Text>
          <Text variant="body" color={C.text.secondary} style={styles.subtitle}>
            {t('auth.verify.subtitle')}{'\n'}
            <Text variant="body" color={C.text.primary}>{email}</Text>
          </Text>
        </View>

        <View style={styles.codeRow}>
          {digits.map((digit, i) => (
            <TextInput
              key={i}
              ref={ref => { inputRefs.current[i] = ref; }}
              value={digit}
              onChangeText={val => handlePaste(i, val)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              editable={!busy}
              selectTextOnFocus
              style={[
                styles.digitBox,
                { backgroundColor: C.surface, borderColor: digit ? C.primary.default : C.border, color: C.text.primary },
              ]}
              accessibilityLabel={t('auth.verify.digit_label', { number: i + 1 })}
            />
          ))}
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: C.error.bg }]}>
            <Text variant="caption" color={C.error.default}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => isComplete && submit(code)}
          disabled={busy || !isComplete}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: C.primary.default },
            (!isComplete || busy) && styles.disabledButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('auth.verify.button_label')}
        >
          {busy
            ? <ActivityIndicator color={C.text.inverse} size="small" />
            : <Text variant="body" color={C.text.inverse} style={styles.buttonLabel}>{t('auth.verify.button')}</Text>
          }
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={busy || resent}
          style={({ pressed }) => [styles.resendButton, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <Text variant="caption" color={resent ? C.text.tertiary : C.text.secondary}>
            {resent ? t('auth.verify.code_sent') : t('auth.verify.resend_prompt')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 28,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  header: {
    gap: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 22,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  digitBox: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
  },
  errorBanner: {
    borderRadius: 8,
    padding: 12,
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
  resendButton: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
});
