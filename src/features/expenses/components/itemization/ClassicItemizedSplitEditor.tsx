import React from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../../components/ui/Text';
import { Avatar } from '../../../../components/ui/Avatar';
import { useColors, personColorFor } from '../../../../theme/colors';
import { formatCurrency } from '../../../../core/utils/formatCurrency';
import { currencySymbol } from '../../../../core/constants/currencies';
import { useTranslation } from 'react-i18next';
import type { ItemizedSplitEditorProps } from './types';

// The default itemized-split editor: description + amount entry per item,
// plus tap-a-member-to-assign, all in one list. Registered under the
// 'classic' key in registry.ts — see types.ts for the swappable contract
// a future alternate editor would implement instead.
export function ClassicItemizedSplitEditor({
  items, members, currency, totalAmountCents, itemRaw, setItemRaw,
  onUpdateItem, onRemoveItem, onAddItem, onToggleMember,
  fromMinorUnits, toMinorUnits, sanitizeAmountInput, convertedLabel, styles,
}: ItemizedSplitEditorProps) {
  const { t } = useTranslation();
  const colors = useColors();

  const itemizedTotal = items.reduce((sum, item) => sum + item.amountCents, 0);
  const unassignedCents = totalAmountCents - itemizedTotal;

  return (
    <View>
      {items.length > 0 && (
        <Text style={{ fontSize: 11.5, color: colors.text.tertiary, textAlign: 'center', marginBottom: 12 }}>
          {t('expenses.form.itemized_hint')}
        </Text>
      )}
      {items.map((item, i) => (
        <View key={item.id}>
          {i > 0 && <View style={[styles.rowDivider, { marginBottom: 12 }]} />}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
            {convertedLabel(item.amountCents) && (
              <Text style={[styles.convertedAmount, { textAlign: 'right', marginTop: 2 }]}>
                {convertedLabel(item.amountCents)}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {members.map(m => {
                const on = item.assignedUserIds.includes(m.userId);
                const palette = personColorFor(m.userId, members);
                return (
                  <Pressable
                    key={m.userId}
                    testID={`item-member-toggle-${item.id}-${m.userId}`}
                    onPress={() => onToggleMember(item.id, m.userId)}
                    style={{ opacity: on ? 1 : 0.4 }}
                  >
                    <View style={{
                      borderWidth: on ? 2 : 1.5,
                      borderColor: on ? colors.primary.default : colors.text.tertiary,
                      borderRadius: 999,
                      padding: on ? 1 : 1.5,
                    }}>
                      <Avatar initials={m.displayName} bg={palette.bg} url={m.avatarUrl} size="xs" />
                    </View>
                  </Pressable>
                );
              })}
            </View>
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

      {items.length > 0 && (
        <>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text.secondary }}>
              {t('expenses.form.unassigned_label')}
            </Text>
            <Text style={[styles.splitAmount, {
              color: unassignedCents === 0 ? colors.success.default : colors.error.default,
            }]}>
              {formatCurrency(unassignedCents, currency)}
              {convertedLabel(unassignedCents) && (
                <Text style={styles.convertedAmount}> {convertedLabel(unassignedCents)}</Text>
              )}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
