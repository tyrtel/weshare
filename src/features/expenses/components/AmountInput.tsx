import React, { useState, useEffect } from 'react';
import { TextInput, View, Text as RNText } from 'react-native';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { getMinorUnitMultiplier } from '../../../core/constants/currencies';

interface AmountInputProps {
  amountCents: number;
  onChangeCents: (cents: number) => void;
  currency: string;
  label?: string;
  readOnly?: boolean;
  /** When true, renders without the bordered box — for inline split rows. */
  compact?: boolean;
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
}: AmountInputProps) {
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
          accessibilityLabel={label ?? 'Amount'}
          style={{ color: colors.text.primary, fontSize: tokens.fontSize.md, padding: 0, minWidth: 50, textAlign: 'right' }}
        />
      </View>
    );
  }

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
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: tokens.radius.md,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.sm,
        }}
      >
        <RNText style={{ color: colors.text.secondary, marginRight: tokens.spacing.xs }}>
          {currency}
        </RNText>
        <TextInput
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          keyboardType={multiplier === 1 ? 'number-pad' : 'decimal-pad'}
          editable={!readOnly}
          accessibilityLabel={label ?? 'Amount'}
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
