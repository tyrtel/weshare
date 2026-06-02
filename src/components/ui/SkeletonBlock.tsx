import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface SkeletonBlockProps {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBlock({
  width,
  height,
  borderRadius = tokens.radius.md,
  style,
}: SkeletonBlockProps) {
  const colors  = useColors();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surface,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
