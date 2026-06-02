import React from 'react';
import { Pressable, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
}: ButtonProps) {
  const colors = useColors();
  const scale  = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // eslint-disable-next-line react-hooks/immutability
  const handlePressIn  = () => { scale.value = withSpring(0.96, { damping: 15, stiffness: 300 }); };
  // eslint-disable-next-line react-hooks/immutability
  const handlePressOut = () => { scale.value = withSpring(1,    { damping: 15, stiffness: 300 }); };

  const bgColor = {
    primary: colors.primary.default,
    ghost:   'transparent',
    danger:  colors.error.bg,
  }[variant];

  const textColor = {
    primary: '#ffffff',
    ghost:   colors.primary.default,
    danger:  colors.error.default,
  }[variant];

  const paddingV = size === 'sm' ? tokens.spacing.xs : tokens.spacing.sm;
  const paddingH = size === 'sm' ? tokens.spacing.sm : tokens.spacing.md;

  return (
    <Animated.View style={Platform.OS !== 'web' ? animatedStyle : undefined}>
      <Pressable
        onPress={onPress}
        onPressIn={Platform.OS !== 'web' ? handlePressIn : undefined}
        onPressOut={Platform.OS !== 'web' ? handlePressOut : undefined}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={({ pressed }) => ({
          backgroundColor: bgColor,
          borderRadius: tokens.radius.pill,
          paddingVertical: paddingV,
          paddingHorizontal: paddingH,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: variant === 'ghost' ? colors.primary.default : undefined,
          opacity: (pressed && Platform.OS === 'web') || disabled ? 0.7 : 1,
          alignItems: 'center',
        })}
      >
        <Text variant="label" color={textColor}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
