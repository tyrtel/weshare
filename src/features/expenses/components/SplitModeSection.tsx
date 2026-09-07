import React from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Segmented } from '../../../components/ui/Segmented';
import { useColors, personColorFor } from '../../../theme/colors';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { currencySymbol } from '../../../core/constants/currencies';
import { makeExpenseFormStyles } from '../screens/expenseFormStyles';
import { useTranslation } from 'react-i18next';
import type { TripMember } from '../../../core/models/TripMember';
import type { SplitMode } from './SplitMemberRow';
import type { UseSplitFormReturn } from '../hooks/useSplitForm';

const SEGMENTED_LABEL_KEYS = {
  equal:        'expenses.form.segmented_evenly',
  custom:       'expenses.form.segmented_exact',
  itemized:     'expenses.form.segmented_items',
  proportional: 'expenses.form.split_proportional',
} as const satisfies Record<SplitMode, string>;

interface SplitModeSectionProps {
  modes: SplitMode[];
  split: UseSplitFormReturn;
  members: TripMember[];
  totalAmountCents: number;
  expenseCurrency: string;
  convertedLabel: (amountMinor: number) => string | null;
  // Edit mode keeps items fully editable (desc/amount inputs, add/remove) with
  // a top total to reconcile against, exactly as before. The add-flow's split
  // step gets a read-only recap instead — items were finalized in step 1, so
  // this step is purely about assigning them, not editing them.
  itemsEditable: boolean;
  exactRaw: Record<string, string>;
  setExactRaw: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  itemRaw: Record<string, string>;
  setItemRaw: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fromMinorUnits: (minorUnits: number, currency: string) => string;
  toMinorUnits: (majorValue: string, currency: string) => number;
  sanitizeAmountInput: (v: string) => string;
  description: string;
}

export function SplitModeSection({
  modes, split, members, totalAmountCents, expenseCurrency, convertedLabel, itemsEditable,
  exactRaw, setExactRaw, itemRaw, setItemRaw, fromMinorUnits, toMinorUnits, sanitizeAmountInput, description,
}: SplitModeSectionProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = makeExpenseFormStyles(colors);

  const assignedCents = split.splitEntries
    .filter(e => e.included && e.customAmountCents !== null)
    .reduce((s, e) => s + (e.customAmountCents ?? 0), 0);
  const unassignedCents = totalAmountCents - assignedCents;
  const unassignedItemsCents = totalAmountCents - split.itemizedTotal;

  return (
    <>
      <Text style={styles.fieldLabel}>{t('expenses.form.split_label')}</Text>
      <Segmented
        value={split.splitMode}
        onChange={k => {
          split.handleSetMode(k as SplitMode);
          setExactRaw({});
          setItemRaw({});
        }}
        options={modes.map(m => ({ key: m, label: t(SEGMENTED_LABEL_KEYS[m]) }))}
      />

      <View style={{ height: 12 }} />

      {split.splitMode === 'equal' && (
        <View style={styles.card}>
          {split.splitEntries.map((entry, i) => {
            const member = members.find(m => m.userId === entry.userId);
            if (!member) return null;
            const includedCount = split.splitEntries.filter(e => e.included).length;
            const share = entry.included && includedCount > 0
              ? Math.round(totalAmountCents / includedCount)
              : 0;
            return (
              <View key={entry.userId}>
                {i > 0 && <View style={styles.rowDivider} />}
                <Pressable style={styles.splitRow} onPress={() => split.handleToggleMember(entry.userId)}>
                  <View style={[styles.check, entry.included && styles.checkOn]}>
                    {entry.included && <Feather name="check" size={13} color={colors.text.inverse} />}
                  </View>
                  <Avatar
                    initials={member.displayName}
                    bg={personColorFor(member.userId, members).bg}
                    url={member.avatarUrl}
                    size="sm"
                  />
                  <Text style={styles.splitName}>{member.displayName}</Text>
                  <Text style={[styles.splitAmount, { color: entry.included ? colors.text.primary : colors.text.tertiary }]}>
                    {formatCurrency(share, expenseCurrency)}
                    {convertedLabel(share) && (
                      <Text style={styles.convertedAmount}> {convertedLabel(share)}</Text>
                    )}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {split.splitMode === 'custom' && (
        <View style={styles.card}>
          {split.splitEntries.map((entry, i) => {
            const member = members.find(m => m.userId === entry.userId);
            if (!member) return null;
            const displayVal = exactRaw[entry.userId] ?? (
              entry.customAmountCents != null && entry.customAmountCents > 0
                ? fromMinorUnits(entry.customAmountCents, expenseCurrency) : ''
            );
            return (
              <View key={entry.userId}>
                {i > 0 && <View style={styles.rowDivider} />}
                <View style={styles.splitRow}>
                  <Avatar
                    initials={member.displayName}
                    bg={personColorFor(member.userId, members).bg}
                    url={member.avatarUrl}
                    size="sm"
                  />
                  <Text style={[styles.splitName, { flex: 1 }]}>{member.displayName}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={styles.exactBox}>
                      <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                        {currencySymbol(expenseCurrency)}
                      </Text>
                      <TextInput
                        testID={`exact-amount-input-${entry.userId}`}
                        style={styles.exactInput}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.text.tertiary}
                        value={displayVal}
                        onChangeText={v => {
                          const cleaned = sanitizeAmountInput(v);
                          setExactRaw(prev => ({ ...prev, [entry.userId]: cleaned }));
                          split.handleChangeAmount(entry.userId, toMinorUnits(cleaned, expenseCurrency));
                        }}
                      />
                    </View>
                    {convertedLabel(entry.customAmountCents ?? 0) && (
                      <Text style={[styles.convertedAmount, { marginTop: 2 }]}>
                        {convertedLabel(entry.customAmountCents ?? 0)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text.secondary }}>
              {t('expenses.form.unassigned_label')}
            </Text>
            <Text style={[styles.splitAmount, {
              color: unassignedCents === 0 ? colors.success.default : colors.error.default,
            }]}>
              {formatCurrency(unassignedCents, expenseCurrency)}
              {convertedLabel(unassignedCents) && (
                <Text style={styles.convertedAmount}> {convertedLabel(unassignedCents)}</Text>
              )}
            </Text>
          </View>
        </View>
      )}

      {split.splitMode === 'itemized' && (
        <View style={[styles.card, { padding: 20 }]}>
          <Text style={[styles.fieldLabel, { textAlign: 'center', marginTop: 0, marginBottom: 4 }]}>
            {description.toUpperCase() || t('expenses.form.receipt_fallback')}
          </Text>
          <Text style={{ fontSize: 11.5, color: colors.text.tertiary, textAlign: 'center', marginBottom: 8 }}>
            {t('expenses.form.itemized_hint')}
          </Text>
          <View style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: colors.borderMuted, marginBottom: 12 }} />
          {split.lineItems.map((item, i) => (
            <View key={item.id}>
              {i > 0 && <View style={[styles.rowDivider, { marginBottom: 12 }]} />}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {itemsEditable ? (
                    <TextInput
                      testID={`item-description-input-${item.id}`}
                      style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.text.primary, paddingVertical: 2 }}
                      value={item.description}
                      onChangeText={v => split.updateLineItem(item.id, { description: v })}
                      placeholder={t('expenses.line_item.placeholder')}
                      placeholderTextColor={colors.text.tertiary}
                    />
                  ) : (
                    <Text
                      testID={`item-description-${item.id}`}
                      style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.text.primary }}
                      numberOfLines={1}
                    >
                      {item.description || t('expenses.line_item.placeholder')}
                    </Text>
                  )}
                  {itemsEditable ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                        {currencySymbol(expenseCurrency)}
                      </Text>
                      <TextInput
                        testID={`item-amount-input-${item.id}`}
                        style={{ fontSize: 14, color: colors.text.primary, minWidth: 56, textAlign: 'right', paddingVertical: 2 }}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.text.tertiary}
                        value={itemRaw[item.id] ?? (item.amountCents > 0 ? fromMinorUnits(item.amountCents, expenseCurrency) : '')}
                        onChangeText={v => {
                          const cleaned = sanitizeAmountInput(v);
                          setItemRaw(prev => ({ ...prev, [item.id]: cleaned }));
                          split.updateLineItem(item.id, { amountCents: toMinorUnits(cleaned, expenseCurrency) });
                        }}
                      />
                    </View>
                  ) : (
                    <Text testID={`item-amount-${item.id}`} style={styles.splitAmount}>
                      {formatCurrency(item.amountCents, expenseCurrency)}
                    </Text>
                  )}
                  {itemsEditable && (
                    <Pressable testID={`item-remove-button-${item.id}`} onPress={() => split.removeLineItem(item.id)} hitSlop={8}>
                      <Feather name="x" size={16} color={colors.text.tertiary} />
                    </Pressable>
                  )}
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
                        onPress={() => split.toggleMemberInItem(item.id, m.userId)}
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
          {itemsEditable && split.lineItems.length > 0 && (
            <>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text.secondary }}>
                  {t('expenses.form.unassigned_label')}
                </Text>
                <Text style={[styles.splitAmount, {
                  color: unassignedItemsCents === 0 ? colors.success.default : colors.error.default,
                }]}>
                  {formatCurrency(unassignedItemsCents, expenseCurrency)}
                  {convertedLabel(unassignedItemsCents) && (
                    <Text style={styles.convertedAmount}> {convertedLabel(unassignedItemsCents)}</Text>
                  )}
                </Text>
              </View>
            </>
          )}
          {itemsEditable && (
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginTop: split.lineItems.length > 0 ? 8 : 0 }}
              onPress={split.addLineItem}
            >
              <Feather name="plus" size={14} color={colors.primary.default} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary.default }}>{t('expenses.form.add_line_item')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </>
  );
}
