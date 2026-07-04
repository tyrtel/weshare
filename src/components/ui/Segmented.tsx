import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ledgerColors } from '../../theme/colors';
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
  return (
    <View style={styles.container}>
      {options.map(option => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
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
    backgroundColor: ledgerColors.border,
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
    backgroundColor: ledgerColors.surface,
    ...ledgerShadow.card,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: ledgerColors.text.secondary,
  },
  labelActive: {
    color: ledgerColors.text.primary,
  },
});
