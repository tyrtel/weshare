import React from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { currencySymbol } from '../../../core/constants/currencies';
import type { ExpenseFormStyles } from '../screens/expenseFormStyles';
import { useTranslation } from 'react-i18next';
import type { ExpenseLineItem } from '../../../core/models/Expense';

interface LineItemEntryListProps {
  items: ExpenseLineItem[];
  currency: string;
  itemRaw: Record<string, string>;
  setItemRaw: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onUpdateItem: (id: string, changes: Partial<Pick<ExpenseLineItem, 'description' | 'amountCents'>>) => void;
  onRemoveItem: (id: string) => void;
  onAddItem: () => void;
  fromMinorUnits: (minorUnits: number, currency: string) => string;
  toMinorUnits: (majorValue: string, currency: string) => number;
  sanitizeAmountInput: (v: string) => string;
  styles: ExpenseFormStyles;
}

// Step-1-only item entry: description + amount per item, no member assignment
// (that happens in step 2, once "Itemized" is chosen as the split method).
export function LineItemEntryList({
  items, currency, itemRaw, setItemRaw, onUpdateItem, onRemoveItem, onAddItem,
  fromMinorUnits, toMinorUnits, sanitizeAmountInput, styles,
}: LineItemEntryListProps) {
  const { t } = useTranslation();
  const colors = useColors();

  return (
    <View style={styles.card}>
      {items.map((item, i) => (
        <View key={item.id}>
          {i > 0 && <View style={styles.rowDivider} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
            <TextInput
              testID={`item-description-input-${item.id}`}
              style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.text.primary, paddingVertical: 2 }}
              value={item.description}
              onChangeText={v => onUpdateItem(item.id, { description: v })}
              placeholder={t('expenses.line_item.placeholder')}
              placeholderTextColor={colors.text.tertiary}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                {currencySymbol(currency)}
              </Text>
              <TextInput
                testID={`item-amount-input-${item.id}`}
                style={{ fontSize: 14, color: colors.text.primary, minWidth: 56, textAlign: 'right', paddingVertical: 2 }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.text.tertiary}
                value={itemRaw[item.id] ?? (item.amountCents > 0 ? fromMinorUnits(item.amountCents, currency) : '')}
                onChangeText={v => {
                  const cleaned = sanitizeAmountInput(v);
                  setItemRaw(prev => ({ ...prev, [item.id]: cleaned }));
                  onUpdateItem(item.id, { amountCents: toMinorUnits(cleaned, currency) });
                }}
              />
            </View>
            <Pressable testID={`item-remove-button-${item.id}`} onPress={() => onRemoveItem(item.id)} hitSlop={8}>
              <Feather name="x" size={16} color={colors.text.tertiary} />
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginTop: items.length > 0 ? 4 : 0 }}
        onPress={onAddItem}
      >
        <Feather name="plus" size={14} color={colors.primary.default} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary.default }}>{t('expenses.form.add_line_item')}</Text>
      </Pressable>
    </View>
  );
}
