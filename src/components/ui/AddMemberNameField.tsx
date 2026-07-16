import React, { useCallback, useState } from 'react';
import { View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface AddMemberNameFieldProps {
  existingNames: string[];
  onAdd: (name: string) => Promise<boolean>;
  placeholder: string;
  addButtonLabel: string;
  duplicateErrorLabel: string;
  genericErrorLabel: string;
  fieldAccessibilityLabel: string;
  addButtonAccessibilityLabel?: string;
}

export function AddMemberNameField({
  existingNames,
  onAdd,
  placeholder,
  addButtonLabel,
  duplicateErrorLabel,
  genericErrorLabel,
  fieldAccessibilityLabel,
  addButtonAccessibilityLabel,
}: AddMemberNameFieldProps) {
  const colors = useColors();
  const [name,   setName]   = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const isDuplicate = name.trim().length > 0 &&
    existingNames.some(n => n.toLowerCase() === name.trim().toLowerCase());

  const handleAdd = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || isDuplicate) return;
    setSaving(true);
    setFailed(false);
    const ok = await onAdd(trimmed);
    setSaving(false);
    if (ok) setName('');
    else setFailed(true);
  }, [name, isDuplicate, onAdd]);

  return (
    <View style={{ marginBottom: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <TextInput
          value={name}
          onChangeText={text => { setName(text); setFailed(false); }}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            borderColor: isDuplicate ? colors.error.default : colors.border,
            borderWidth: 1,
            borderRadius: tokens.radius.md,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm,
            color: colors.text.primary,
            fontSize: tokens.fontSize.md,
          }}
          accessibilityLabel={fieldAccessibilityLabel}
        />
        <Pressable
          onPress={handleAdd}
          disabled={!name.trim() || saving || isDuplicate}
          accessibilityRole="button"
          accessibilityLabel={addButtonAccessibilityLabel ?? addButtonLabel}
          style={({ pressed }) => ({
            backgroundColor: colors.primary.default,
            borderRadius: tokens.radius.md,
            paddingHorizontal: tokens.spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: (!name.trim() || saving || isDuplicate) ? 0.4 : pressed ? 0.8 : 1,
          })}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.text.inverse} />
            : <Text variant="label" color={colors.text.inverse}>{addButtonLabel}</Text>}
        </Pressable>
      </View>
      {isDuplicate && (
        <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.xs }}>
          {duplicateErrorLabel}
        </Text>
      )}
      {failed && (
        <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.xs }}>
          {genericErrorLabel}
        </Text>
      )}
    </View>
  );
}
