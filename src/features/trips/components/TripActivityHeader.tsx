import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface TripActivityHeaderProps {
  count: number;
  showAll: boolean;
  onToggleShowAll: () => void;
}

export function TripActivityHeader({ count, showAll, onToggleShowAll }: TripActivityHeaderProps) {
  const colors = useColors();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: tokens.spacing.sm,
      }}
    >
      <Text variant="label" color={colors.text.secondary}>Recent Activity</Text>
      {count > 3 && (
        <Pressable
          onPress={onToggleShowAll}
          accessibilityRole="button"
          accessibilityLabel={showAll ? 'Show fewer expenses' : 'Show all expenses'}
          hitSlop={8}
        >
          <Text variant="caption" color={colors.primary.light}>
            {showAll ? 'Show less' : `Show all ${count}`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
