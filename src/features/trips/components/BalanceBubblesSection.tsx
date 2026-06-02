import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/ui/Text';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { computeMemberNetBalances } from '../../../core/logic/settlement';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { TripMember } from '../../../core/models/TripMember';
import type { Expense } from '../../../core/models/Expense';

// Cents below this threshold are treated as effectively settled (rounding noise).
const THRESHOLD = 50;

// Debtors always render larger than creditors so the "biggest debtor" reads
// as the most prominent element in the group.
const DEBTOR_SIZE_MAX  = 108;
const DEBTOR_SIZE_MIN  = 76;
const CREDIT_SIZE_MAX  = 68;
const CREDIT_SIZE_MIN  = 52;

function firstName(name: string): string {
  return name.split(/\s+/)[0];
}

interface BalanceBubblesSectionProps {
  members: TripMember[];
  expenses: Expense[];
  currency: string;
}

export function BalanceBubblesSection({ members, expenses, currency }: BalanceBubblesSectionProps) {
  const colors = useColors();

  // Join balance data with member objects, sort most-negative (biggest debtor) first.
  const sorted = useMemo(() => {
    const raw = computeMemberNetBalances(members, expenses);
    return raw
      .map(b => ({ ...b, member: members.find(m => m.userId === b.userId)! }))
      .filter(b => b.member !== undefined)
      .sort((a, b) => a.balanceCents - b.balanceCents);
  }, [members, expenses]);

  if (expenses.length === 0 || sorted.length === 0) return null;

  const debtors = sorted.filter(b => b.balanceCents < -THRESHOLD);
  const credits = sorted.filter(b => b.balanceCents >  THRESHOLD);

  const maxDebt   = debtors.reduce((m, b) => Math.max(m, Math.abs(b.balanceCents)), 1);
  const maxCredit = credits.reduce((m, b) => Math.max(m, b.balanceCents), 1);

  function bubbleSize(cents: number): number {
    if (cents < -THRESHOLD) {
      return DEBTOR_SIZE_MIN + (Math.abs(cents) / maxDebt) * (DEBTOR_SIZE_MAX - DEBTOR_SIZE_MIN);
    }
    if (cents > THRESHOLD) {
      return CREDIT_SIZE_MIN + (cents / maxCredit) * (CREDIT_SIZE_MAX - CREDIT_SIZE_MIN);
    }
    return 48;
  }

  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: tokens.spacing.md }}
      >
        Current standings
      </Text>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: tokens.spacing.lg,
        }}
      >
        {sorted.map(({ userId, balanceCents, member }) => {
          const isDebtor   = balanceCents < -THRESHOLD;
          const isCreditor = balanceCents >  THRESHOLD;
          const size = bubbleSize(balanceCents);

          const bg   = isDebtor ? colors.error.bg      : isCreditor ? colors.success.bg      : colors.surface;
          const tint = isDebtor ? colors.error.default : isCreditor ? colors.success.default : colors.text.tertiary;
          const bw   = isDebtor || isCreditor ? 2 : 1;

          // Both font sizes scale linearly with the bubble diameter (48–108px range).
          const nameFontSize   = Math.round(9  + (size - 48) / 60 * 5); // 9 → 14 px
          const amountFontSize = Math.round(8  + (size - 48) / 60 * 4); // 8 → 12 px

          const amountLabel = isDebtor
            ? `−${formatCurrency(Math.abs(balanceCents), currency)}`
            : isCreditor
              ? `+${formatCurrency(balanceCents, currency)}`
              : 'even';

          return (
            <View
              key={userId}
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: bg,
                borderWidth: bw,
                borderColor: tint,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: tokens.spacing.xs,
                ...tokens.shadow.sm,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: nameFontSize, fontWeight: '700', color: tint, lineHeight: nameFontSize + 2 }}
              >
                {firstName(member.displayName)}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: amountFontSize, fontWeight: '600', color: tint, lineHeight: amountFontSize + 2 }}
              >
                {amountLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
