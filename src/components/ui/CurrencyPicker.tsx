import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { CURRENCIES, currencyLabel } from '../../core/constants/currencies';

interface CurrencyPickerProps {
  currency: string;
  onSelect: (code: string) => void;
  fieldLabel: string;
  selectLabel: string;
  selectHeading: string;
  closeLabel: string;
}

// Shared name/currency form field + dropdown overlay, extracted from three
// near-identical copies in CreateTripScreen, app/group/create.tsx, and
// app/group/edit.tsx. Owns its own open/closed state — callers only need to
// track the selected currency code.
export function CurrencyPicker({
  currency, onSelect, fieldLabel, selectLabel, selectHeading, closeLabel,
}: CurrencyPickerProps) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
        {fieldLabel}
      </Text>
      <Pressable
        onPress={() => setVisible(true)}
        accessibilityRole="combobox"
        accessibilityLabel={selectLabel}
        accessibilityState={{ expanded: visible }}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
          borderRadius: tokens.radius.md, paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.sm, marginBottom: tokens.spacing.lg,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text variant="body" color={colors.text.primary}>{currencyLabel(currency)}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
      </Pressable>

      {visible && (
        <Pressable
          style={[styles.backdrop, { padding: tokens.spacing.xl }]}
          onPress={() => setVisible(false)}
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: tokens.radius.card }]}>
            <View style={{
              paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
              borderBottomWidth: 1, borderBottomColor: colors.border,
            }}>
              <Text variant="label" color={colors.text.secondary}>{selectHeading}</Text>
            </View>
            {CURRENCIES.map((item, index) => {
              const selected = item.code === currency;
              return (
                <View key={item.code}>
                  {index > 0 && <View style={{ height: 1, backgroundColor: colors.borderMuted }} />}
                  <Pressable
                    onPress={() => { onSelect(item.code); setVisible(false); }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.md,
                      backgroundColor: pressed ? colors.surfaceAlt : selected ? colors.primary.subtle : 'transparent',
                    })}
                  >
                    <Text variant="body" color={selected ? colors.primary.default : colors.text.primary}>
                      {`${item.symbol} ${item.code}`}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={16} color={colors.primary.default} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    zIndex: 100,
  },
  sheet: { overflow: 'hidden' },
});
