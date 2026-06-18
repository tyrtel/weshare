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
import { darkColors as C } from '../../src/theme/colors';

type Mode = 'signin' | 'signup';

export default function EmailAuthScreen() {
  const auth   = useService(AUTH);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode]         = useState<Mode>('signin');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef  = useRef<TextInput>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  function validate(): string | null {
    if (mode === 'signup' && !name.trim()) return 'Please enter your name.';
    if (!email.trim()) return 'Please enter your email.';
    if (!email.includes('@')) return 'Please enter a valid email address.';
    if (!password) return 'Please enter a password.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (mode === 'signup' && password !== confirm) return 'Passwords do not match.';
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setBusy(true);
    setError(null);

    if (mode === 'signin') {
      const result = await auth.signIn(email.trim(), password);
      setBusy(false);
      if (!isOk(result)) {
        setError(result.error.message);
      } else {
        router.replace('/' as Parameters<typeof router.replace>[0]);
      }
    } else {
      const result = await auth.signUp(email.trim(), password, name.trim());
      setBusy(false);
      if (!isOk(result)) {
        setError(result.error.message);
      } else if ('needsEmailConfirmation' in result.value) {
        setConfirmed(true);
      } else {
        router.replace('/' as Parameters<typeof router.replace>[0]);
      }
    }
  }

  // ── Email confirmation holding screen ────────────────────────────────────
  if (confirmed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.confirmBox}>
          <Text variant="heading" style={styles.title}>Check your email</Text>
          <Text variant="body" color={C.text.secondary} style={styles.subtitle}>
            We sent a verification link to{' '}
            <Text variant="body" color={C.text.primary}>{email}</Text>.
            {'\n\n'}Open the link to activate your account, then come back and sign in.
          </Text>
          <Pressable
            onPress={() => { setConfirmed(false); setMode('signin'); setPassword(''); setConfirm(''); }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text variant="body" color={C.text.inverse} style={{ fontWeight: '600' }}>
              Sign in
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
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
        {/* Back */}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Go back"
        >
          <Text variant="body" color={C.primary.default}>← Back</Text>
        </Pressable>

        {/* Mode toggle */}
        <View style={styles.toggle}>
          <Pressable
            onPress={() => switchMode('signin')}
            style={[styles.toggleTab, mode === 'signin' && styles.toggleTabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'signin' }}
          >
            <Text
              variant="body"
              style={[styles.toggleLabel, mode === 'signin' && styles.toggleLabelActive]}
            >
              Sign in
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchMode('signup')}
            style={[styles.toggleTab, mode === 'signup' && styles.toggleTabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'signup' }}
          >
            <Text
              variant="body"
              style={[styles.toggleLabel, mode === 'signup' && styles.toggleLabelActive]}
            >
              Create account
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text variant="caption" color={C.error.default}>{error}</Text>
            </View>
          ) : null}

          {/* Name — sign-up only */}
          {mode === 'signup' && (
            <View style={styles.field}>
              <Text variant="label" color={C.text.secondary} style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={t => { setName(t); setError(null); }}
                placeholder="Your display name"
                placeholderTextColor={C.text.tertiary}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                style={styles.input}
                accessibilityLabel="Your name"
              />
            </View>
          )}

          {/* Email */}
          <View style={styles.field}>
            <Text variant="label" color={C.text.secondary} style={styles.label}>Email</Text>
            <TextInput
              ref={emailRef}
              value={email}
              onChangeText={t => { setEmail(t); setError(null); }}
              placeholder="you@example.com"
              placeholderTextColor={C.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              style={styles.input}
              accessibilityLabel="Email address"
            />
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text variant="label" color={C.text.secondary} style={styles.label}>Password</Text>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={t => { setPassword(t); setError(null); }}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              placeholderTextColor={C.text.tertiary}
              secureTextEntry
              returnKeyType={mode === 'signup' ? 'next' : 'go'}
              onSubmitEditing={mode === 'signup' ? () => confirmRef.current?.focus() : handleSubmit}
              style={styles.input}
              accessibilityLabel="Password"
            />
          </View>

          {/* Confirm password — sign-up only */}
          {mode === 'signup' && (
            <View style={styles.field}>
              <Text variant="label" color={C.text.secondary} style={styles.label}>Confirm password</Text>
              <TextInput
                ref={confirmRef}
                value={confirm}
                onChangeText={t => { setConfirm(t); setError(null); }}
                placeholder="••••••••"
                placeholderTextColor={C.text.tertiary}
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                style={styles.input}
                accessibilityLabel="Confirm password"
              />
            </View>
          )}

          <Pressable
            onPress={handleSubmit}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryButton,
              busy && styles.disabledButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={mode === 'signin' ? 'Sign in' : 'Create account'}
          >
            {busy
              ? <ActivityIndicator color={C.text.inverse} size="small" />
              : (
                <Text variant="body" color={C.text.inverse} style={{ fontWeight: '600' }}>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              )
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
    backgroundColor: C.background,
    paddingHorizontal: 24,
    gap: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 4,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  toggleTabActive: {
    backgroundColor: C.background,
  },
  toggleLabel: {
    color: C.text.secondary,
    fontWeight: '500',
  },
  toggleLabelActive: {
    color: C.text.primary,
    fontWeight: '600',
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
  confirmBox: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text.primary,
  },
  subtitle: {
    lineHeight: 22,
  },
});
