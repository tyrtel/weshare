import React, { useEffect } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, {
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

const FAB_COMPACT  = 56;
const FAB_EXTENDED = 168;

interface TripFABProps {
  onAddExpense: () => void;
  onAddPeople: () => void;
  isExtended: boolean;
}

export function TripFAB({ onAddExpense, onAddPeople, isExtended }: TripFABProps) {
  const colors = useColors();

  const fabWidth     = useSharedValue(FAB_COMPACT);
  const labelOpacity = useSharedValue(0);

  useEffect(() => {
    fabWidth.value     = withSpring(isExtended ? FAB_EXTENDED : FAB_COMPACT, { damping: 15, stiffness: 200 });
    labelOpacity.value = withTiming(isExtended ? 1 : 0, { duration: 200 });
  }, [isExtended, fabWidth, labelOpacity]);

  const animatedFabStyle   = useAnimatedStyle(() => ({ width: fabWidth.value }));
  const animatedLabelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));

  return (
    <View
      style={{
        position: 'absolute',
        bottom: tokens.spacing.xl,
        right: tokens.spacing.md,
        alignItems: 'flex-end',
        gap: tokens.spacing.sm,
      }}
    >
      {/* Secondary: Add people (labelled pill) */}
      <Animated.View
        entering={Platform.OS !== 'web' ? ZoomIn.delay(100).duration(300).springify() : undefined}
      >
        <Pressable
          onPress={onAddPeople}
          accessibilityRole="button"
          accessibilityLabel="Add people"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: tokens.spacing.xs,
            height: 36,
            borderRadius: tokens.radius.pill,
            paddingHorizontal: tokens.spacing.md,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.primary.dim,
            opacity: pressed ? 0.7 : 1,
            ...tokens.shadow.md,
          })}
        >
          <Ionicons name="person-add-outline" size={16} color={colors.primary.default} />
          <Text variant="caption" color={colors.primary.default}>Add People</Text>
        </Pressable>
      </Animated.View>

      {/* Primary: Add expense */}
      <Animated.View
        entering={Platform.OS !== 'web' ? ZoomIn.delay(200).duration(300).springify() : undefined}
      >
        <Animated.View
          style={[
            animatedFabStyle,
            {
              height: FAB_COMPACT,
              borderRadius: FAB_COMPACT / 2,
              overflow: 'hidden',
              ...tokens.shadow.lg,
            },
          ]}
        >
          <Pressable
            onPress={onAddExpense}
            accessibilityRole="button"
            accessibilityLabel="Add expense"
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: tokens.spacing.md,
              backgroundColor: colors.primary.default,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="add" size={24} color="#ffffff" />
            <Animated.View style={[animatedLabelStyle, { marginLeft: tokens.spacing.xs }]}>
              <Text variant="label" color="#ffffff">Add expense</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
