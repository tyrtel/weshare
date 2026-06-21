import React from 'react';
import { View, ActivityIndicator, Pressable } from 'react-native';
import { Text } from './Text';
import { tokens } from '../../theme/tokens';

// Hardcoded to match the native splash background — cannot use theme hooks here
// because this component renders before the ServiceProvider is ready.
const BG      = '#1a1a2e';
const PRIMARY = '#1D9E75';

interface AppLoadingScreenProps {
  message?: string;
  error?:   string;
  onRetry?: () => void;
}

export function AppLoadingScreen({ message, error, onRetry }: AppLoadingScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
      <Text
        variant="heading1"
        style={{ color: '#e8e8f5', marginBottom: tokens.spacing.xl, letterSpacing: -0.5 }}
      >
        ouiShare
      </Text>

      {error ? (
        <>
          <Text variant="body" style={{ color: '#9a9ab8', textAlign: 'center', marginBottom: tokens.spacing.md }}>
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
              <Text variant="label" style={{ color: PRIMARY }}>Try again</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <ActivityIndicator color={PRIMARY} size="large" />
          {message && (
            <Text
              variant="caption"
              style={{ color: '#6b6b8a', marginTop: tokens.spacing.md, textAlign: 'center' }}
            >
              {message}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
