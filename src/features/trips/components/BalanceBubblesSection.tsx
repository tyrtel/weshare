import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { computeMemberNetBalances } from '../../../core/logic/settlement';
import { useColors, personColorFor } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { useStandingsStyle, type StandingsStyle } from '../hooks/useStandingsStyle';
import type { TripMember } from '../../../core/models/TripMember';
import type { Expense } from '../../../core/models/Expense';

const THRESHOLD = 50;

const DEBTOR_SIZE_MAX = 108;
const DEBTOR_SIZE_MIN = 76;
const CREDIT_SIZE_MAX = 68;
const CREDIT_SIZE_MIN = 52;

function firstName(name: string): string {
  return name.split(/\s+/)[0];
}

interface BalanceBubblesSectionProps {
  members: TripMember[];
  expenses: Expense[];
  currency: string;
}

type BalanceRow = {
  userId: string;
  balanceCents: number;
  member: TripMember;
};

// ── Style toggle ──────────────────────────────────────────────────────────────

const STYLE_TABS: { key: StandingsStyle; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tinted', icon: 'ellipse-outline' },
  { key: 'list',   icon: 'list-outline' },
];

function StyleToggle() {
  const { style, setStyle } = useStandingsStyle();
  const colors = useColors();

  return (
    <View style={{ flexDirection: 'row', gap: tokens.spacing.xs }}>
      {STYLE_TABS.map(({ key, icon }) => {
        const active = style === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => setStyle(key)}
            hitSlop={8}
            style={{
              padding: tokens.spacing.xs,
              borderRadius: tokens.radius.sm,
              backgroundColor: active ? colors.primary.subtle : 'transparent',
            }}
          >
            <Ionicons
              name={icon}
              size={18}
              color={active ? colors.primary.default : colors.text.tertiary}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Mode A: tinted (dark-bg + vibrant-text, design system convention) ─────────

function TintedBubbles({ sorted, currency, members }: {
  sorted: BalanceRow[];
  currency: string;
  members: TripMember[];
}) {
  const { t } = useTranslation();
  const colors = useColors();

  const debtors  = sorted.filter(b => b.balanceCents < -THRESHOLD);
  const credits  = sorted.filter(b => b.balanceCents >  THRESHOLD);
  const maxDebt  = debtors.reduce((m, b) => Math.max(m, Math.abs(b.balanceCents)), 1);
  const maxCredit = credits.reduce((m, b) => Math.max(m, b.balanceCents), 1);

  function bubbleSize(cents: number) {
    if (cents < -THRESHOLD) return DEBTOR_SIZE_MIN + (Math.abs(cents) / maxDebt)   * (DEBTOR_SIZE_MAX - DEBTOR_SIZE_MIN);
    if (cents >  THRESHOLD) return CREDIT_SIZE_MIN + (cents           / maxCredit) * (CREDIT_SIZE_MAX - CREDIT_SIZE_MIN);
    return 48;
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end', gap: tokens.spacing.lg }}>
      {sorted.map(({ userId, balanceCents, member }) => {
        const isDebtor   = balanceCents < -THRESHOLD;
        const isCreditor = balanceCents >  THRESHOLD;
        const size = bubbleSize(balanceCents);

        const bg   = isDebtor ? colors.error.bg   : isCreditor ? colors.success.bg   : colors.surface;
        const tint = isDebtor ? colors.error.default : isCreditor ? colors.success.default : colors.text.tertiary;

        const nameFontSize   = Math.round(9  + (size - 48) / 60 * 5);
        const amountFontSize = Math.round(8  + (size - 48) / 60 * 4);

        const amountLabel = isDebtor
          ? `−${formatCurrency(Math.abs(balanceCents), currency)}`
          : isCreditor
            ? `+${formatCurrency(balanceCents, currency)}`
            : t('trips.balance_bubbles.even');

        return (
          <View
            key={userId}
            style={{
              width: size, height: size, borderRadius: size / 2,
              backgroundColor: bg, borderWidth: 1, borderColor: tint,
              alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: tokens.spacing.xs, ...tokens.shadow.sm,
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: nameFontSize, fontWeight: '700', color: tint, lineHeight: nameFontSize + 2 }}>
              {firstName(member.displayName)}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: amountFontSize, fontWeight: '600', color: tint, lineHeight: amountFontSize + 2 }}>
              {amountLabel}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Mode B: list (avatar row, no bubbles) ─────────────────────────────────────

function ListRows({ sorted, currency, members }: {
  sorted: BalanceRow[];
  currency: string;
  members: TripMember[];
}) {
  const { t } = useTranslation();
  const colors = useColors();

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {sorted.map(({ userId, balanceCents, member }) => {
        const isDebtor   = balanceCents < -THRESHOLD;
        const isCreditor = balanceCents >  THRESHOLD;
        const palette = personColorFor(userId, members);

        const pillBg   = isDebtor ? colors.error.bg    : isCreditor ? colors.success.bg    : colors.surfaceAlt;
        const pillText = isDebtor ? colors.error.default : isCreditor ? colors.success.default : colors.text.tertiary;

        const amountLabel = isDebtor
          ? `−${formatCurrency(Math.abs(balanceCents), currency)}`
          : isCreditor
            ? `+${formatCurrency(balanceCents, currency)}`
            : t('trips.balance_bubbles.even');

        return (
          <View
            key={userId}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: tokens.spacing.xs,
              paddingHorizontal: tokens.spacing.sm,
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Avatar
              initials={member.displayName}
              bg={palette.bg}
              size="sm"
              url={member.avatarUrl}
            />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                marginLeft: tokens.spacing.sm,
                fontSize: tokens.fontSize.md,
                fontWeight: '500',
                color: colors.text.primary,
              }}
            >
              {member.displayName}
            </Text>
            <View
              style={{
                backgroundColor: pillBg,
                borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.sm,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: tokens.fontSize.sm, fontWeight: '600', color: pillText }}>
                {amountLabel}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BalanceBubblesSection({ members, expenses, currency }: BalanceBubblesSectionProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const { style } = useStandingsStyle();

  const sorted = useMemo(() => {
    const raw = computeMemberNetBalances(members, expenses);
    return raw
      .map(b => ({ ...b, member: members.find(m => m.userId === b.userId)! }))
      .filter(b => b.member !== undefined)
      .sort((a, b) => a.balanceCents - b.balanceCents);
  }, [members, expenses]);

  if (expenses.length === 0 || sorted.length === 0) return null;

  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.md }}>
        <Text variant="label" color={colors.text.secondary} style={{ flex: 1 }}>
          {t('trips.balance_bubbles.title')}
        </Text>
        <StyleToggle />
      </View>

      {style === 'tinted' && <TintedBubbles sorted={sorted} currency={currency} members={members} />}
      {style === 'list'   && <ListRows      sorted={sorted} currency={currency} members={members} />}
    </View>
  );
}
