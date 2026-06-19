import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { isOk } from '../../src/core/types/Result';
import { Text } from '../../src/components/ui/Text';
import { darkColors as C } from '../../src/theme/colors';

export default function SignInScreen() {
  const auth    = useService(AUTH);
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState<'email' | 'google' | 'apple' | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  async function handleEmailSignIn() {
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (!password)     { setError('Please enter your password.'); return; }

    setBusy('email');
    setError(null);
    const result = await auth.signIn(email.trim(), password);
    setBusy(null);
    if (!isOk(result)) {
      setError(result.error.message);
    } else {
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }

  async function handleGoogle() {
    setBusy('google');
    setError(null);
    const result = await auth.signInWithGoogle();
    setBusy(null);
    if (!isOk(result)) {
      const msg = result.error.message;
      if (!msg.includes('SIGN_IN_CANCELLED') && !msg.includes('PLAY_SERVICES_NOT_AVAILABLE')) {
        setError(msg);
      }
    } else {
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }

  async function handleApple() {
    setBusy('apple');
    setError(null);
    const result = await auth.signInWithApple();
    setBusy(null);
    if (!isOk(result)) {
      const msg = result.error.message;
      if (!msg.includes('ERR_CANCELED')) setError(msg);
    } else {
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }

  const isAnyBusy = busy !== null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branding */}
        <View style={styles.brandSection}>
          <View style={styles.logoPlaceholder}>
            <Text style={{ fontSize: 40 }}>✈️</Text>
          </View>
          <Text variant="heading" style={styles.appName}>ouiShare</Text>
          <Text variant="body" color={C.text.secondary} style={styles.tagline}>
            Split trips, not friendships.
          </Text>
        </View>

        {/* Email sign-in */}
        <View style={styles.formSection}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text variant="caption" color={C.error.default}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <TextInput
              value={email}
              onChangeText={t => { setEmail(t); setError(null); }}
              placeholder="Email"
              placeholderTextColor={C.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!isAnyBusy}
              style={[styles.input, styles.inputTop]}
              accessibilityLabel="Email address"
            />
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={t => { setPassword(t); setError(null); }}
              placeholder="Password"
              placeholderTextColor={C.text.tertiary}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={handleEmailSignIn}
              editable={!isAnyBusy}
              style={[styles.input, styles.inputBottom]}
              accessibilityLabel="Password"
            />
          </View>

          <Pressable
            onPress={handleEmailSignIn}
            disabled={isAnyBusy}
            style={({ pressed }) => [
              styles.primaryButton,
              isAnyBusy && styles.disabledButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {busy === 'email'
              ? <ActivityIndicator color={C.text.inverse} size="small" />
              : <Text variant="body" color={C.text.inverse} style={styles.buttonLabel}>Sign in</Text>
            }
          </Pressable>

          <Pressable
            onPress={() => router.push('/auth/forgot-password' as Parameters<typeof router.push>[0])}
            disabled={isAnyBusy}
            style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            <Text variant="caption" color={C.text.secondary}>Forgot password?</Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text variant="caption" color={C.text.tertiary} style={styles.dividerLabel}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social sign-in */}
        <View style={styles.socialSection}>
          <Pressable
            onPress={handleGoogle}
            disabled={isAnyBusy}
            style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
          >
            {busy === 'google'
              ? <ActivityIndicator color={C.text.primary} size="small" />
              : (
                <>
                  <Text style={styles.googleG}>G</Text>
                  <Text variant="body" style={styles.socialLabel}>Continue with Google</Text>
                </>
              )
            }
          </Pressable>

          {Platform.OS === 'ios' && (
            <Pressable
              onPress={handleApple}
              disabled={isAnyBusy}
              style={({ pressed }) => [styles.socialButton, styles.appleButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Apple"
            >
              {busy === 'apple'
                ? <ActivityIndicator color={C.text.inverse} size="small" />
                : (
                  <>
                    <Text style={styles.appleIcon}></Text>
                    <Text variant="body" style={[styles.socialLabel, styles.appleLabel]}>
                      Continue with Apple
                    </Text>
                  </>
                )
              }
            </Pressable>
          )}
        </View>

        {/* Create account */}
        <View style={styles.createSection}>
          <Text variant="body" color={C.text.secondary}>Don't have an account?</Text>
          <Pressable
            onPress={() => router.push('/auth/signup' as Parameters<typeof router.push>[0])}
            disabled={isAnyBusy}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text variant="body" color={C.primary.default} style={styles.createLink}>
              {' '}Create one
            </Text>
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
  brandSection: {
    alignItems: 'center',
    gap: 12,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: C.text.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    textAlign: 'center',
    color: C.text.secondary,
  },
  formSection: {
    gap: 12,
  },
  errorBanner: {
    backgroundColor: C.error.bg,
    borderRadius: 8,
    padding: 12,
  },
  field: {
    gap: 0,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text.primary,
  },
  inputTop: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: 0.5,
  },
  inputBottom: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopWidth: 0.5,
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
    opacity: 0.75,
  },
  buttonLabel: {
    fontWeight: '600',
  },
  textLink: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  dividerLabel: {
    fontSize: 13,
  },
  socialSection: {
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
  },
  appleButton: {
    backgroundColor: C.text.primary,
    borderColor: C.text.primary,
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  appleIcon: {
    fontSize: 18,
    color: C.text.inverse,
  },
  socialLabel: {
    color: C.text.primary,
    fontWeight: '600',
  },
  appleLabel: {
    color: C.text.inverse,
  },
  createSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
  },
  createLink: {
    fontWeight: '600',
  },
});
