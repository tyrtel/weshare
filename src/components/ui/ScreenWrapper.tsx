import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../../theme/colors';

interface ScreenWrapperProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * When true the wrapper replaces its children with a centered spinner.
   * Use with useSessionPersistence: isLoading={!isHydrated}
   */
  isLoading?: boolean;
}

export function ScreenWrapper({ children, style, isLoading = false }: ScreenWrapperProps) {
  const colors = useColors();

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}
