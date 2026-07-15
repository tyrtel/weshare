import React from 'react';
import { TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface LabeledTextInputProps extends TextInputProps {
  label: string;
}

// A label above a bordered text input, styled to the ledger form-field
// convention — extracted from four identical copies (name field) in
// CreateTripScreen, EditTripScreen, app/group/create.tsx, and
// app/group/edit.tsx.
export function LabeledTextInput({ label, style, ...inputProps }: LabeledTextInputProps) {
  const colors = useColors();

  return (
    <>
      <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.text.tertiary}
        style={[
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: tokens.radius.md,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm,
            color: colors.text.primary,
            fontSize: tokens.fontSize.md,
            marginBottom: tokens.spacing.md,
          },
          style,
        ]}
        {...inputProps}
      />
    </>
  );
}
