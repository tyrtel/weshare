import React, { useState, useEffect, useRef } from 'react';
import { TextInput, View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { validateIBAN, formatIBAN } from '../../features/settlement/utils/ibanValidation';

interface IBANInputFieldProps {
  value:        string;
  onChange:     (raw: string, isValid: boolean) => void;
  placeholder?: string;
}

export function IBANInputField({
  value,
  onChange,
  placeholder = 'FR76 3000 6000 0112 3456 7890 189',
}: IBANInputFieldProps) {
  const colors = useColors();
  const [dirty, setDirty]   = useState(false);
  // Display text is managed internally. We only reformat from the parent value
  // when the input is not focused (cursor is inactive → no jump).
  const [displayText, setDisplayText] = useState(() => formatIBAN(value));
  // Ref so the effect guard doesn't add focused to its dep array — if focused
  // were a dep, handleBlur's setFocused(false) would re-trigger the effect and
  // overwrite the text we just formatted with the stale parent value.
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayText(formatIBAN(value));
    }
  }, [value]);

  const raw     = displayText.replace(/\s/g, '');
  const isValid = validateIBAN(raw);
  const showError = dirty && raw.length > 0 && !isValid;

  const handleChange = (text: string) => {
    // Strip disallowed characters and uppercase — but do NOT reformat while
    // the user is typing. Reformatting repositions the cursor to the end.
    const cleaned = text.replace(/[^A-Za-z0-9\s]/g, '').toUpperCase();
    setDisplayText(cleaned);
    const stripped = cleaned.replace(/\s/g, '');
    onChange(stripped, validateIBAN(stripped));
  };

  const handleFocus = () => {
    focusedRef.current = true;
  };

  const handleBlur = () => {
    focusedRef.current = false;
    setDirty(true);
    // Format with spaces on blur — cursor is inactive so no position jump.
    setDisplayText(formatIBAN(displayText.replace(/\s/g, '')));
  };

  const borderColor = showError
    ? colors.error.default
    : isValid && raw.length > 0
      ? colors.success.default
      : colors.border;

  return (
    <View>
      <TextInput
        value={displayText}
        onChangeText={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType="default"
        style={[
          styles.input,
          {
            color:           colors.text.primary,
            backgroundColor: colors.surfaceAlt,
            borderColor,
          },
        ]}
        accessibilityLabel="IBAN input"
        accessibilityHint="Enter your IBAN in format FR76 3000 …"
      />
      {showError && (
        <Text
          variant="caption"
          color={colors.error.default}
          style={{ marginTop: tokens.spacing.xs }}
        >
          Invalid IBAN — please check and re-enter
        </Text>
      )}
      {isValid && raw.length > 0 && (
        <Text
          variant="caption"
          color={colors.success.default}
          style={{ marginTop: tokens.spacing.xs }}
        >
          IBAN valid
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth:       1,
    borderRadius:      tokens.radius.md,
    paddingVertical:   tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    fontSize:          16,
    letterSpacing:     1,
    fontVariant:       ['tabular-nums'],
  },
});
