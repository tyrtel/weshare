import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useColors } from '../../theme/colors';
import { ledgerRadius, ledgerShadow } from '../../theme/tokens';

interface SegmentedOption {
  key: string;
  label: string;
}

interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (key: string) => void;
}

export function Segmented({ options, value, onChange }: SegmentedProps) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.border }]}>
      {options.map(option => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segment, active && [styles.segmentActive, { backgroundColor: colors.surface }]]}
          >
            <Text style={[styles.label, { color: active ? colors.text.primary : colors.text.secondary }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: ledgerRadius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: ledgerRadius.md - 3,
  },
  segmentActive: {
    ...ledgerShadow.card,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
});
