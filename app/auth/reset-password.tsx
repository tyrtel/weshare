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
import { darkColors as C } from '../../src/theme/colors';

const CODE_LENGTH = 6;

export default function ResetPasswordScreen() {
  const auth   = useService(AUTH);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { email = '' } = useLocalSearchParams<{ email: string }>();

  const [digits, setDigits]       = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [resentDone, setResentDone] = useState(false);

  const inputRefs   = useRef<(TextInput | null)[]>(Array(CODE_LENGTH).fill(null));
  const passwordRef = useRef<TextInput>(null);
  const confirmRef  = useRef<TextInput>(null);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  function handleDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(null);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (digit && next.every(d => d !== '')) {
      passwordRef.current?.focus();
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

  function handlePaste(index: number, value: string) {
    const pasted = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (pasted.length === CODE_LENGTH) {
      setDigits(pasted.split(''));
      inputRefs.current[CODE_LENGTH - 1]?.focus();
    } else {
      handleDigit(index, value);
    }
  }

  function validate(): string | null {
    if (digits.some(d => d === ''))  return 'Please enter the 6-digit code.';
    if (!password)                   return 'Please enter a new password.';
    if (password.length < 6)         return 'Password must be at least 6 characters.';
    if (password !== confirm)        return 'Passwords do not match.';
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setBusy(true);
    setError(null);
    const result = await auth.confirmPasswordReset(email, digits.join(''), password);
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
    const result = await auth.sendPasswordReset(email);
    setBusy(false);
    if (isOk(result)) {
      setResentDone(true);
    } else {
      setError(result.error.message);
    }
  }

  const codeComplete = digits.every(d => d !== '');

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
          accessibilityLabel="Go back"
        >
          <Text variant="body" color={C.primary.default}>← Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text variant="heading" style={styles.title}>Set new password</Text>
          <Text variant="body" color={C.text.secondary} style={styles.subtitle}>
            Enter the 6-digit code sent to{'\n'}
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
              style={[styles.digitBox, digit ? styles.digitBoxFilled : null]}
              accessibilityLabel={`Digit ${i + 1}`}
            />
          ))}
        </View>

        <View style={styles.passwordSection}>
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={t => { setPassword(t); setError(null); }}
            placeholder="New password (6+ characters)"
            placeholderTextColor={C.text.tertiary}
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            editable={!busy}
            style={styles.input}
            accessibilityLabel="New password"
          />
          <TextInput
            ref={confirmRef}
            value={confirm}
            onChangeText={t => { setConfirm(t); setError(null); }}
            placeholder="Confirm new password"
            placeholderTextColor={C.text.tertiary}
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            editable={!busy}
            style={styles.input}
            accessibilityLabel="Confirm new password"
          />
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text variant="caption" color={C.error.default}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={busy || !codeComplete}
          style={({ pressed }) => [
            styles.primaryButton,
            (!codeComplete || busy) && styles.disabledButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Set new password"
        >
          {busy
            ? <ActivityIndicator color={C.text.inverse} size="small" />
            : <Text variant="body" color={C.text.inverse} style={styles.buttonLabel}>Set new password</Text>
          }
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={busy || resentDone}
          style={({ pressed }) => [styles.resendButton, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <Text variant="caption" color={resentDone ? C.text.tertiary : C.text.secondary}>
            {resentDone ? 'Code resent!' : "Didn't receive a code? Send again"}
          </Text>
        </Pressable>
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
    gap: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text.primary,
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
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: C.text.primary,
  },
  digitBoxFilled: {
    borderColor: C.primary.default,
  },
  passwordSection: {
    gap: 12,
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
  errorBanner: {
    backgroundColor: C.error.bg,
    borderRadius: 8,
    padding: 12,
  },
  primaryButton: {
    backgroundColor: C.primary.default,
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
