import React, { useState, useRef } from 'react';
import {
  View,
  Image,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { isOk } from '../../src/core/types/Result';
import { Text } from '../../src/components/ui/Text';
import { useTranslation } from 'react-i18next';
import { useColors } from '../../src/theme/colors';
import { ledgerRadius, ledgerFonts } from '../../src/theme/tokens';

export default function SignInScreen() {
  const { t } = useTranslation();
  const auth    = useService(AUTH);
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy]               = useState<'email' | 'google' | 'apple' | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  async function handleEmailSignIn() {
    if (!email.trim()) { setError(t('auth.sign_in.error_email_empty')); return; }
    if (!password)     { setError(t('auth.sign_in.error_password_empty')); return; }

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
          { backgroundColor: colors.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branding */}
        <View style={styles.brandSection}>
          <Image
            source={require('../../assets/icon.png')}
            style={[styles.logoPlaceholder, { backgroundColor: colors.surface }]}
          />
          <Text style={[styles.appName, { color: colors.text.primary }]}>{t('auth.welcome.app_name')}</Text>
          <Text variant="body" color={colors.text.secondary} style={styles.tagline}>
            {t('auth.welcome.tagline')}
          </Text>
        </View>

        {/* Email sign-in */}
        <View style={[styles.formSection, { backgroundColor: colors.surface, shadowColor: colors.text.primary }]}>
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.error.bg }]}>
              <Text variant="caption" color={colors.error.default}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <TextInput
              value={email}
              onChangeText={v => { setEmail(v); setError(null); }}
              placeholder={t('auth.sign_in.email_placeholder')}
              placeholderTextColor={colors.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!isAnyBusy}
              style={[styles.input, styles.inputTop, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text.primary }]}
              accessibilityLabel={t('auth.email_accessibility')}
            />
            <View style={{ position: 'relative' }}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={v => { setPassword(v); setError(null); }}
                placeholder={t('auth.sign_in.password_placeholder')}
                placeholderTextColor={colors.text.tertiary}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={handleEmailSignIn}
                editable={!isAnyBusy}
                style={[styles.input, styles.inputBottom, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text.primary, paddingRight: 48 }]}
                accessibilityLabel={t('auth.password_accessibility')}
              />
              <Pressable
                onPress={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 4 }}
                hitSlop={8}
                accessibilityLabel={showPassword ? t('auth.hide_password') : t('auth.show_password')}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.text.tertiary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleEmailSignIn}
            disabled={isAnyBusy}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary.default },
              isAnyBusy && styles.disabledButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('auth.sign_in.button')}
          >
            {busy === 'email'
              ? <ActivityIndicator color={colors.text.inverse} size="small" />
              : <Text variant="body" color={colors.text.inverse} style={styles.buttonLabel}>{t('auth.sign_in.button')}</Text>
            }
          </Pressable>

          <Pressable
            onPress={() => router.push('/auth/forgot-password' as Parameters<typeof router.push>[0])}
            disabled={isAnyBusy}
            style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            <Text variant="caption" color={colors.text.secondary}>{t('auth.sign_in.forgot_password')}</Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text variant="caption" color={colors.text.tertiary} style={styles.dividerLabel}>{t('auth.sign_in.divider_or')}</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Social sign-in */}
        <View style={styles.socialSection}>
          <Pressable
            onPress={handleGoogle}
            disabled={isAnyBusy}
            style={({ pressed }) => [styles.socialButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('auth.sign_in.google_label')}
          >
            {busy === 'google'
              ? <ActivityIndicator color={colors.text.primary} size="small" />
              : (
                <>
                  <Text style={styles.googleG}>G</Text>
                  <Text variant="body" style={[styles.socialLabel, { color: colors.text.primary }]}>{t('auth.sign_in.google_button')}</Text>
                </>
              )
            }
          </Pressable>

          {Platform.OS === 'ios' && (
            <Pressable
              onPress={handleApple}
              disabled={isAnyBusy}
              style={({ pressed }) => [
                styles.socialButton,
                { backgroundColor: colors.text.primary, borderColor: colors.text.primary },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('auth.sign_in.apple_label')}
            >
              {busy === 'apple'
                ? <ActivityIndicator color={colors.text.inverse} size="small" />
                : (
                  <>
                    <Text style={[styles.appleIcon, { color: colors.text.inverse }]}></Text>
                    <Text variant="body" style={[styles.socialLabel, { color: colors.text.inverse }]}>{t('auth.sign_in.apple_button')}</Text>
                  </>
                )
              }
            </Pressable>
          )}
        </View>

        {/* Create account */}
        <View style={styles.createSection}>
          <Text variant="body" color={colors.text.secondary}>{t('auth.sign_in.no_account')}</Text>
          <Pressable
            onPress={() => router.push('/auth/signup' as Parameters<typeof router.push>[0])}
            disabled={isAnyBusy}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text variant="body" color={colors.primary.default} style={styles.createLink}>
              {' '}{t('auth.sign_in.create_account_link')}
            </Text>
          </Pressable>
        </View>

        {/* Privacy policy */}
        <Pressable
          onPress={() => {
            const url = Constants.expoConfig?.extra?.privacyPolicyUrl as string | undefined;
            if (url) Linking.openURL(url).catch(() => undefined);
          }}
          style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.6 }]}
          accessibilityRole="link"
        >
          <Text variant="caption" color={colors.text.tertiary}>{t('auth.welcome.privacy_policy_link')}</Text>
        </Pressable>
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
  brandSection: {
    alignItems: 'center',
    gap: 12,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 8,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    fontFamily: ledgerFonts.display,
    letterSpacing: -0.5,
  },
  tagline: {
    textAlign: 'center',
  },
  formSection: {
    borderRadius: ledgerRadius.card,
    padding: 20,
    gap: 12,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  errorBanner: {
    borderRadius: 8,
    padding: 12,
  },
  field: {
    gap: 0,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  inputTop: {
    borderTopLeftRadius: ledgerRadius.md,
    borderTopRightRadius: ledgerRadius.md,
    borderBottomWidth: 0.5,
  },
  inputBottom: {
    borderBottomLeftRadius: ledgerRadius.md,
    borderBottomRightRadius: ledgerRadius.md,
    borderTopWidth: 0.5,
  },
  primaryButton: {
    borderRadius: ledgerRadius.md,
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
    paddingVertical: 12,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
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
    borderWidth: 1,
    borderRadius: ledgerRadius.md,
    paddingVertical: 14,
    gap: 10,
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  appleIcon: {
    fontSize: 18,
  },
  socialLabel: {
    fontWeight: '600',
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
