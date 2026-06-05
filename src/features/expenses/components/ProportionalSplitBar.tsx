import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

const TRACK_HEIGHT  = 4;
const HANDLE_SIZE   = 22;
const CONTAINER_H   = HANDLE_SIZE + tokens.spacing.xs * 2;

interface ProportionalSplitBarProps {
  /** Basis points: 0–10000. */
  weight: number;
  /** Fill colour — pass the person's palette bg. */
  color: string;
  /** Accent for the handle border. */
  accent: string;
  onChange: (bps: number) => void;
}

export function ProportionalSplitBar({
  weight,
  color,
  accent,
  onChange,
}: ProportionalSplitBarProps) {
  const colors          = useColors();
  const trackWidthRef   = useRef(0);
  const startWeightRef  = useRef(weight);
  const onChangeRef     = useRef(onChange);
  const fillWidth       = useSharedValue(0);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Sync fill when weight changes from outside (normalisation or mode entry).
  useEffect(() => {
    if (trackWidthRef.current > 0) {
      fillWidth.value = withSpring(
        weight / 10000 * trackWidthRef.current,
        { damping: 20, stiffness: 300 },
      );
    }
  }, [weight, fillWidth]);

  const dragGesture = Gesture.Pan()
    .onBegin(() => {
      startWeightRef.current = weight;
    })
    .onUpdate(({ translationX }) => {
      if (trackWidthRef.current === 0) return;
      const raw     = startWeightRef.current + Math.round(translationX / trackWidthRef.current * 10000);
      const clamped = Math.max(0, Math.min(10000, raw));
      fillWidth.value = clamped / 10000 * trackWidthRef.current;
    })
    .onEnd(({ translationX }) => {
      if (trackWidthRef.current === 0) return;
      const raw     = startWeightRef.current + Math.round(translationX / trackWidthRef.current * 10000);
      const clamped = Math.max(0, Math.min(10000, raw));
      fillWidth.value = withSpring(
        clamped / 10000 * trackWidthRef.current,
        { damping: 20, stiffness: 300 },
      );
      runOnJS(onChangeRef.current)(clamped);
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: Math.max(0, fillWidth.value),
  }));

  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, fillWidth.value - HANDLE_SIZE / 2) }],
  }));

  return (
    <GestureDetector gesture={dragGesture}>
      <View
        style={{
          height: CONTAINER_H,
          justifyContent: 'center',
          marginTop: tokens.spacing.xs,
          marginBottom: tokens.spacing.xs,
        }}
        onLayout={({ nativeEvent: { layout } }) => {
          trackWidthRef.current = layout.width;
          fillWidth.value = weight / 10000 * layout.width;
        }}
      >
        {/* Track */}
        <View
          style={{
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: colors.borderMuted,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={[
              fillStyle,
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                borderRadius: TRACK_HEIGHT / 2,
                backgroundColor: color,
              },
            ]}
          />
        </View>

        {/* Drag handle — positioned absolutely so it overlaps the track */}
        <Animated.View
          style={[
            handleStyle,
            {
              position: 'absolute',
              left: 0,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              borderRadius: HANDLE_SIZE / 2,
              backgroundColor: colors.surface,
              borderWidth: 2,
              borderColor: accent,
              ...tokens.shadow.sm,
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}
