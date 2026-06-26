import React, { useState, useEffect } from 'react';
import { TextInput, View, Text as RNText, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { getMinorUnitMultiplier } from '../../../core/constants/currencies';
import { useTranslation } from 'react-i18next';

interface AmountInputProps {
  amountCents: number;
  onChangeCents: (cents: number) => void;
  currency: string;
  label?: string;
  readOnly?: boolean;
  /** When true, renders without the bordered box — for inline split rows. */
  compact?: boolean;
  /** When provided, the currency code becomes a tappable selector inside the box. */
  onCurrencyPress?: () => void;
  /** When true, the currency selector is highlighted in the primary colour. */
  isForeign?: boolean;
}

function minorUnitsToDisplay(minorUnits: number, multiplier: number): string {
  if (multiplier === 1) return minorUnits === 0 ? '0' : String(Math.round(minorUnits));
  return (minorUnits / multiplier).toFixed(2);
}

function displayToMinorUnits(text: string, multiplier: number): number {
  const parsed = parseFloat(text.replace(/[^0-9.]/g, ''));
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * multiplier);
}

export function AmountInput({
  amountCents,
  onChangeCents,
  currency,
  label,
  readOnly = false,
  compact = false,
  onCurrencyPress,
  isForeign = false,
}: AmountInputProps) {
  const { t } = useTranslation();
  const colors     = useColors();
  const multiplier = getMinorUnitMultiplier(currency);
  const [displayValue, setDisplayValue] = useState(minorUnitsToDisplay(amountCents, multiplier));
  const [focused, setFocused] = useState(false);

  // Only sync external amountCents changes (e.g. equal-split recalculation) when
  // the field is not focused — otherwise we'd reformat the string mid-typing.
  useEffect(() => {
    if (!focused) setDisplayValue(minorUnitsToDisplay(amountCents, multiplier));
  }, [amountCents, focused, multiplier]);

  const handleFocus = () => {
    setFocused(true);
    if (displayToMinorUnits(displayValue, multiplier) === 0) setDisplayValue('');
  };

  const handleBlur = () => {
    setFocused(false);
    const units = displayToMinorUnits(displayValue, multiplier);
    onChangeCents(units);
    setDisplayValue(minorUnitsToDisplay(units, multiplier));
  };

  const handleChangeText = (text: string) => {
    setDisplayValue(text);
    onChangeCents(displayToMinorUnits(text, multiplier));
  };

  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
        <RNText style={{ color: colors.text.primary, fontSize: tokens.fontSize.md, marginRight: 2 }}>
          {currency}
        </RNText>
        <TextInput
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          keyboardType={multiplier === 1 ? 'number-pad' : 'decimal-pad'}
          editable={!readOnly}
          accessibilityLabel={label ?? t('expenses.form.amount_accessibility')}
          style={{ color: colors.text.primary, fontSize: tokens.fontSize.md, padding: 0, minWidth: 50, textAlign: 'right' }}
        />
      </View>
    );
  }

  const currencyColor = isForeign ? colors.primary.default : colors.text.secondary;

  return (
    <View>
      {label && (
        <RNText
          style={{
            color: colors.text.secondary,
            fontSize: tokens.fontSize.sm,
            marginBottom: tokens.spacing.xs,
          }}
        >
          {label}
        </RNText>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderColor: isForeign ? colors.primary.default : colors.border,
          borderWidth: 1,
          borderRadius: tokens.radius.md,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.sm,
        }}
      >
        {onCurrencyPress ? (
          <Pressable
            onPress={onCurrencyPress}
            accessibilityRole="combobox"
            accessibilityLabel={t('trips.form.currency_select_label')}
            accessibilityState={{ expanded: false }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              marginRight: tokens.spacing.sm,
              paddingRight: tokens.spacing.sm,
              borderRightWidth: 1,
              borderRightColor: isForeign ? colors.primary.subtle : colors.borderMuted,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <RNText style={{ color: currencyColor, fontSize: tokens.fontSize.sm, fontWeight: '600' }}>
              {currency}
            </RNText>
            <Ionicons name="chevron-down" size={11} color={currencyColor} style={{ marginLeft: 2 }} />
          </Pressable>
        ) : (
          <RNText style={{ color: colors.text.secondary, marginRight: tokens.spacing.xs }}>
            {currency}
          </RNText>
        )}
        <TextInput
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          keyboardType={multiplier === 1 ? 'number-pad' : 'decimal-pad'}
          editable={!readOnly}
          accessibilityLabel={label ?? t('expenses.form.amount_accessibility')}
          style={{
            flex: 1,
            color: readOnly ? colors.text.secondary : colors.text.primary,
            fontSize: tokens.fontSize.md,
            padding: 0,
          }}
        />
      </View>
    </View>
  );
}
