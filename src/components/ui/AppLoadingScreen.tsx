import React from 'react';
import { View, Image, ActivityIndicator, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { tokens } from '../../theme/tokens';
import { useColors } from '../../theme/colors';

interface AppLoadingScreenProps {
  message?:       string;
  error?:         string;
  onRetry?:       () => void;
  onDebugReset?:  () => void;
}

export function AppLoadingScreen({ message, error, onRetry, onDebugReset }: AppLoadingScreenProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const BG      = colors.background;
  const PRIMARY = colors.primary.default;
  return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require('../../../assets/icon.png')}
        style={{ width: 96, height: 96, borderRadius: 20, marginBottom: tokens.spacing.xl }}
        resizeMode="contain"
      />

      {error ? (
        <>
          <Text variant="body" style={{ color: colors.text.secondary, textAlign: 'center', marginBottom: tokens.spacing.md }}>
            {error}
          </Text>
          {onRetry && (
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: tokens.spacing.lg,
                paddingVertical: tokens.spacing.sm,
                borderRadius: tokens.radius.pill,
                borderWidth: 1,
                borderColor: PRIMARY,
                opacity: pressed ? 0.7 : 1,
                marginTop: tokens.spacing.sm,
              })}
            >
              <Text variant="label" style={{ color: PRIMARY }}>{t('common.try_again')}</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <ActivityIndicator color={PRIMARY} size="large" />
          {message && (
            <Text
              variant="caption"
              style={{ color: colors.text.secondary, marginTop: tokens.spacing.md, textAlign: 'center' }}
            >
              {message}
            </Text>
          )}
        </>
      )}

      {onDebugReset && (
        <Pressable
          onPress={onDebugReset}
          accessibilityRole="button"
          accessibilityLabel="Reset authentication state"
          style={({ pressed }) => ({
            position: 'absolute',
            bottom: 36,
            alignSelf: 'center',
            padding: tokens.spacing.sm,
            opacity: pressed ? 0.7 : 0.35,
          })}
        >
          <Text variant="caption" style={{ color: colors.text.secondary }}>{t('common.debug.reset_auth_button')}</Text>
        </Pressable>
      )}
    </View>
  );
}
