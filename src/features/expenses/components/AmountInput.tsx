import React, { useState, useEffect } from 'react';
import { TextInput, View, Text as RNText } from 'react-native';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface AmountInputProps {
  amountCents: number;
  onChangeCents: (cents: number) => void;
  currency: string;
  label?: string;
  readOnly?: boolean;
  /** When true, renders without the bordered box — for inline split rows. */
  compact?: boolean;
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

function displayToCents(text: string): number {
  const parsed = parseFloat(text.replace(/[^0-9.]/g, ''));
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function AmountInput({
  amountCents,
  onChangeCents,
  currency,
  label,
  readOnly = false,
  compact = false,
}: AmountInputProps) {
  const colors = useColors();
  const [displayValue, setDisplayValue] = useState(centsToDisplay(amountCents));
  const [focused, setFocused] = useState(false);

  // Only sync external amountCents changes (e.g. equal-split recalculation) when
  // the field is not focused — otherwise we'd reformat the string mid-typing.
  useEffect(() => {
    if (!focused) setDisplayValue(centsToDisplay(amountCents));
  }, [amountCents, focused]);

  const handleFocus = () => {
    setFocused(true);
    if (displayToCents(displayValue) === 0) setDisplayValue('');
  };

  const handleBlur = () => {
    setFocused(false);
    const cents = displayToCents(displayValue);
    onChangeCents(cents);
    setDisplayValue(centsToDisplay(cents));
  };

  const handleChangeText = (text: string) => {
    setDisplayValue(text);
    onChangeCents(displayToCents(text));
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
          keyboardType="decimal-pad"
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
          keyboardType="decimal-pad"
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
