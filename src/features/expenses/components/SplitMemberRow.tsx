import React from 'react';
import { View, Pressable } from 'react-native';
import { Avatar } from '../../../components/ui/Avatar';
import { Text } from '../../../components/ui/Text';
import { AmountInput } from './AmountInput';
import { ProportionalSplitBar } from './ProportionalSplitBar';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { personColors, useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { TripMember } from '../../../core/models/TripMember';

export type SplitMode = 'equal' | 'proportional' | 'custom';

interface SplitMemberRowProps {
  member: TripMember;
  colorIndex: number;
  included: boolean;
  amountCents: number;
  splitMode: SplitMode;
  /** Basis points (0–10000). Only used in proportional mode. */
  weight?: number;
  currency: string;
  onToggleInclude: () => void;
  onChangeAmount: (cents: number) => void;
  onChangeWeight?: (bps: number) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}


export function SplitMemberRow({
  member,
  colorIndex,
  included,
  amountCents,
  splitMode,
  weight = 0,
  currency,
  onToggleInclude,
  onChangeAmount,
  onChangeWeight,
}: SplitMemberRowProps) {
  const colors  = useColors();
  const palette = personColors[colorIndex % personColors.length];

  return (
    <Pressable
      onPress={onToggleInclude}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: included }}
      accessibilityLabel={member.displayName}
      style={{
        paddingVertical: tokens.spacing.sm,
        opacity: included ? 1 : 0.4,
      }}
    >
      {/* Main row */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Inclusion indicator */}
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: included ? colors.primary.default : colors.border,
            backgroundColor: included ? colors.primary.default : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: tokens.spacing.sm,
          }}
        >
          {included && (
            <Text variant="caption" color="#fff" style={{ lineHeight: 14 }}>✓</Text>
          )}
        </View>

        <Avatar
          initials={getInitials(member.displayName)}
          bg={palette.bg}
          color={palette.text}
          size="sm"
        />

        <Text
          variant="body"
          style={{ flex: 1, marginLeft: tokens.spacing.sm }}
          numberOfLines={1}
        >
          {member.displayName}
        </Text>

        {/* Amount / percentage display */}
        {included ? (
          splitMode === 'proportional' ? (
            <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
              <Text variant="caption" color={colors.text.tertiary}>
                {(weight / 100).toFixed(0)}%
              </Text>
              <Text variant="label" color={colors.text.primary}>
                {formatCurrency(amountCents, currency)}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={e => e.stopPropagation?.()}
              style={{ width: 100 }}
            >
              <AmountInput
                amountCents={amountCents}
                onChangeCents={onChangeAmount}
                currency={currency}
                readOnly={splitMode !== 'custom'}
              />
            </Pressable>
          )
        ) : (
          <Text variant="caption" color={colors.text.tertiary} style={{ minWidth: 80, textAlign: 'right' }}>
            excluded
          </Text>
        )}
      </View>

      {/* Proportional bar — only in proportional mode when included */}
      {splitMode === 'proportional' && included && onChangeWeight && (
        <ProportionalSplitBar
          weight={weight}
          color={palette.text}
          accent={palette.text}
          onChange={onChangeWeight}
        />
      )}
    </Pressable>
  );
}
