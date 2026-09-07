import React from 'react';
import { Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface HeaderConfirmButtonProps {
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  accessibilityLabel: string;
  /** Defaults to a checkmark (save/confirm). Pass e.g. "arrow-forward" for a "Continue" step. */
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}

// The small circular checkmark button used as `Stack.Screen`'s `headerRight`
// on every create/edit form — extracted from three identical copies in
// CreateTripScreen, app/group/create.tsx, and app/group/edit.tsx.
export function HeaderConfirmButton({ onPress, disabled, loading, accessibilityLabel, icon = 'checkmark', testID }: HeaderConfirmButtonProps) {
  const colors = useColors();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: disabled ? colors.text.tertiary : colors.primary.default,
        alignItems: 'center', justifyContent: 'center',
        marginRight: tokens.spacing.xs, opacity: pressed ? 0.8 : 1,
      })}
    >
      {loading
        ? <ActivityIndicator color={colors.text.inverse} size="small" />
        : <Ionicons name={icon} size={20} color={colors.text.inverse} />}
    </Pressable>
  );
}
