import React, { useState, useRef } from 'react';
import { View, TextInput, Pressable, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { isOk } from '../../src/core/types/Result';
import { Text } from '../../src/components/ui/Text';
import { darkColors as C } from '../../src/theme/colors';

export default function GuestNameScreen() {
  const auth   = useService(AUTH);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await auth.signInAsGuest(trimmed);
    setBusy(false);
    if (!isOk(result)) {
      setError(result.error.message);
    } else {
      // Navigate directly — onAuthStateChange fires before the upsert completes
      // so AuthGate would see user=null and miss the redirect.
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Go back"
          >
            <Text variant="body" color={C.primary.default}>← Back</Text>
          </Pressable>
          <Text variant="heading" style={styles.title}>What's your name?</Text>
          <Text variant="body" color={C.text.secondary} style={styles.subtitle}>
            You can create an account later to save your trips.
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text variant="caption" color={C.error.default}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            ref={inputRef}
            value={name}
            onChangeText={t => { setName(t); setError(null); }}
            placeholder="Your name"
            placeholderTextColor={C.text.tertiary}
            autoFocus
            autoCapitalize="words"
            returnKeyType="go"
            onSubmitEditing={handleContinue}
            style={styles.input}
            accessibilityLabel="Your name"
          />

          <Pressable
            onPress={handleContinue}
            disabled={busy || !name.trim()}
            style={({ pressed }) => [
              styles.continueButton,
              (busy || !name.trim()) && styles.disabledButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            {busy
              ? <ActivityIndicator color={C.text.inverse} size="small" />
              : <Text variant="body" color={C.text.inverse} style={{ fontWeight: '600' }}>Continue</Text>
            }
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    paddingHorizontal: 24,
    gap: 40,
  },
  header: {
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text.primary,
  },
  subtitle: {
    color: C.text.secondary,
    lineHeight: 22,
  },
  form: {
    gap: 16,
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
  continueButton: {
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
});
