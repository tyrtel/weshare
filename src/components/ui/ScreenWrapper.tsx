import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../../theme/colors';

interface ScreenWrapperProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * When true the wrapper replaces its children with either the provided
   * skeleton or a centred ActivityIndicator.
   */
  isLoading?: boolean;
  /**
   * Layout-preserving placeholder rendered instead of a spinner when isLoading
   * is true. Falls back to ActivityIndicator when omitted.
   */
  skeleton?: React.ReactNode;
}

export function ScreenWrapper({
  children,
  style,
  isLoading = false,
  skeleton,
}: ScreenWrapperProps) {
  const colors = useColors();

  const loadingContent = skeleton ?? (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary.default} size="large" />
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {isLoading ? loadingContent : children}
    </SafeAreaView>
  );
}
