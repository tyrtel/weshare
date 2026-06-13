import React, { useState } from 'react';
import { View, Pressable, ActivityIndicator, Platform, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { isOk } from '../../src/core/types/Result';
import { Text } from '../../src/components/ui/Text';
import { darkColors as C } from '../../src/theme/colors';

export default function WelcomeScreen() {
  const auth    = useService(AUTH);
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [busy, setBusy]     = useState<'google' | 'apple' | null>(null);
  const [error, setError]   = useState<string | null>(null);

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

  return (
    <View style={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
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

      {/* Auth buttons */}
      <View style={styles.buttonSection}>
        {error ? (
          <View style={styles.errorBanner}>
            <Text variant="caption" color={C.error.default}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleGoogle}
          disabled={busy !== null}
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
            disabled={busy !== null}
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

        <Pressable
          onPress={() => router.push('/auth/guest' as Parameters<typeof router.push>[0])}
          disabled={busy !== null}
          style={({ pressed }) => [styles.guestButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Continue as guest"
        >
          <Text variant="body" color={C.text.secondary}>Continue as guest</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  brandSection: {
    alignItems: 'center',
    gap: 12,
    marginTop: 32,
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
  buttonSection: {
    gap: 12,
  },
  errorBanner: {
    backgroundColor: C.error.bg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
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
  pressed: {
    opacity: 0.75,
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
  guestButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
});
