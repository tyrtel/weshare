import React, { useState, useEffect } from 'react';
import { TextInput, View, Text as RNText } from 'react-native';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface AmountInputProps {
  amountCents: number;
  onChangeCents: (cents: number) => void;
  currency: string;
  label?: string;
  /** When true, the field is read-only (used in SplitMemberRow equal-mode). */
  readOnly?: boolean;
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
}: AmountInputProps) {
  const colors = useColors();
  // Keep a local string while the user is editing; commit to cents on blur.
  const [displayValue, setDisplayValue] = useState(centsToDisplay(amountCents));

  // Sync when amountCents changes externally (e.g. equal-split recalculation).
  useEffect(() => {
    setDisplayValue(centsToDisplay(amountCents));
  }, [amountCents]);

  const handleFocus = () => {
    if (displayToCents(displayValue) === 0) setDisplayValue('');
  };

  const handleBlur = () => {
    const cents = displayToCents(displayValue);
    onChangeCents(cents);
    setDisplayValue(centsToDisplay(cents));
  };

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
          onChangeText={setDisplayValue}
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
