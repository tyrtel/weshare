import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { useColors, personColorFor } from '../../../theme/colors';
import { makeExpenseFormStyles } from '../screens/expenseFormStyles';
import { useTranslation } from 'react-i18next';
import type { TripMember } from '../../../core/models/TripMember';

interface PayerPickerProps {
  members: TripMember[];
  paidByUserId: string;
  onSelect: (userId: string) => void;
  // Disambiguating first-name labels for members sharing a first initial —
  // see initialCollisionLabels in ExpenseFormScreen.
  labels: Record<string, string>;
}

export function PayerPicker({ members, paidByUserId, onSelect, labels }: PayerPickerProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = makeExpenseFormStyles(colors);

  return (
    <>
      <Text style={styles.fieldLabel}>{t('expenses.form.paid_by_label')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {members.map(m => {
          const active = paidByUserId === m.userId;
          const palette = personColorFor(m.userId, members);
          const label = labels[m.userId];
          return (
            <Pressable
              key={m.userId}
              testID={`payer-select-${m.userId}`}
              accessibilityRole="button"
              accessibilityLabel={t('expenses.form.paid_by_select_label', { name: m.displayName })}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(m.userId)}
              style={{ alignItems: 'center', gap: 4, opacity: active ? 1 : 0.5 }}
            >
              <View style={{
                borderWidth: active ? 2 : 0, borderColor: colors.primary.default,
                borderRadius: 999, padding: active ? 2 : 0,
              }}>
                <Avatar initials={m.displayName} bg={palette.bg} url={m.avatarUrl} size="lg" />
              </View>
              {label && (
                <Text
                  style={{ fontSize: 11, fontWeight: '500', color: active ? colors.primary.default : colors.text.secondary, maxWidth: 64 }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
