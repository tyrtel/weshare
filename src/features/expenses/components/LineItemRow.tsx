import React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../../components/ui/Avatar';
import { AmountInput } from './AmountInput';
import { personColors, useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { ExpenseLineItem } from '../../../core/models/Expense';
import type { TripMember } from '../../../core/models/TripMember';
import { useTranslation } from 'react-i18next';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface LineItemRowProps {
  item: ExpenseLineItem;
  members: TripMember[];
  currency: string;
  onUpdateDescription: (description: string) => void;
  onUpdateAmount: (amountCents: number) => void;
  onToggleMember: (userId: string) => void;
  onRemove: () => void;
}

export function LineItemRow({
  item,
  members,
  currency,
  onUpdateDescription,
  onUpdateAmount,
  onToggleMember,
  onRemove,
}: LineItemRowProps) {
  const { t } = useTranslation();
  const colors = useColors();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: tokens.spacing.sm,
        marginBottom: tokens.spacing.sm,
      }}
    >
      {/* Description + amount + remove */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
        <TextInput
          value={item.description}
          onChangeText={onUpdateDescription}
          placeholder={t('expenses.line_item.placeholder')}
          placeholderTextColor={colors.text.tertiary}
          style={{
            flex: 1,
            color: colors.text.primary,
            fontSize: tokens.fontSize.md,
          }}
          returnKeyType="done"
          accessibilityLabel={t('expenses.line_item.description_label')}
        />
        <Pressable onPress={e => e.stopPropagation?.()}>
          <AmountInput
            amountCents={item.amountCents}
            onChangeCents={onUpdateAmount}
            currency={currency}
            compact
          />
        </Pressable>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('expenses.line_item.remove_label')}
        >
          <Ionicons name="close-circle-outline" size={20} color={colors.text.tertiary} />
        </Pressable>
      </View>

      {/* Per-member assignment — tap avatar to toggle in/out */}
      <View style={{ flexDirection: 'row', gap: tokens.spacing.xs, marginTop: tokens.spacing.sm, flexWrap: 'wrap' }}>
        {members.map((member, i) => {
          const palette  = personColors[i % personColors.length];
          const assigned = item.assignedUserIds.includes(member.userId);
          return (
            <Pressable
              key={member.userId}
              onPress={() => onToggleMember(member.userId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: assigned }}
              accessibilityLabel={member.displayName}
              style={{ opacity: assigned ? 1 : 0.3 }}
            >
              <Avatar
                initials={getInitials(member.displayName)}
                bg={palette.text}
                url={member.avatarUrl}
                size="sm"
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
