import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { LedgerBars } from './LedgerBars';
import type { BalanceViewMode } from '../../core/hooks/useBalanceView';
import { useColors, personColorFor } from '../../theme/colors';
import type { ColorPalette } from '../../theme/colors';
import { ledgerRadius, ledgerFonts } from '../../theme/tokens';
import { formatCurrency } from '../../core/utils/formatCurrency';

const VIEW_ICONS: Record<BalanceViewMode, keyof typeof Ionicons.glyphMap> = {
  bars: 'stats-chart-outline',
  list: 'list-outline',
  bubbles: 'ellipse-outline',
};
const VIEW_MODES: BalanceViewMode[] = ['bars', 'list', 'bubbles'];

// Bubble diameter range — smallest balance in the set gets BUBBLE_MIN,
// the largest magnitude gets BUBBLE_MAX, so bubble size visually tracks standing.
const BUBBLE_MIN = 40;
const BUBBLE_MAX = 68;

interface Member {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

interface Props {
  balances: Record<string, number>;
  members: Member[];
  viewMode: BalanceViewMode;
  onChangeView: (mode: BalanceViewMode) => void;
  currency?: string;
}

export function BalanceViewSelector({ balances, members, viewMode, onChangeView, currency = 'EUR' }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const memberMap = new Map(members.map(m => [m.userId, m]));
  const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]);
  const maxAbsBalance = Math.max(1, ...sorted.map(([, cents]) => Math.abs(cents)));

  return (
    <View style={styles.root}>
      <View style={styles.toggleRow}>
        {VIEW_MODES.map((mode) => {
          const active = mode === viewMode;
          return (
            <Pressable
              key={mode}
              onPress={() => onChangeView(mode)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t(`balance_view.${mode}_label`)}
              style={[styles.toggleBtn, active && { backgroundColor: colors.primary.subtle }]}
            >
              <Ionicons
                name={VIEW_ICONS[mode]}
                size={16}
                color={active ? colors.primary.default : colors.text.tertiary}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.content}>
        {viewMode === 'bars' && (
          <LedgerBars balances={balances} members={members} />
        )}

        {viewMode === 'list' && (
          <View style={styles.list}>
            {sorted.map(([userId, cents], i) => {
              const member = memberMap.get(userId);
              if (!member) return null;
              const isOwed = cents >= 0;
              const color = cents === 0
                ? colors.text.tertiary
                : isOwed ? colors.success.default : colors.error.default;
              const sign = cents === 0 ? '' : isOwed ? '+' : '−';
              const initials = member.displayName.trim().charAt(0).toUpperCase();
              const pc = personColorFor(userId, members);
              return (
                <View key={userId}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.listRow}>
                    <Avatar initials={initials} bg={pc.bg} size="sm" url={member.avatarUrl} />
                    <Text style={styles.listName} numberOfLines={1}>{member.displayName}</Text>
                    <Text style={[styles.listAmount, { color }]}>
                      {sign}{formatCurrency(Math.abs(cents), currency)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {viewMode === 'bubbles' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bubbles}>
            {sorted.map(([userId, cents]) => {
              const member = memberMap.get(userId);
              if (!member) return null;
              const isOwed = cents >= 0;
              const ringColor = cents === 0
                ? colors.border
                : isOwed ? colors.success.default : colors.error.default;
              const amountColor = cents === 0
                ? colors.text.tertiary
                : isOwed ? colors.success.default : colors.error.default;
              const sign = cents === 0 ? '' : isOwed ? '+' : '−';
              const initials = member.displayName.trim().charAt(0).toUpperCase();
              const firstName = member.displayName.split(' ')[0];
              const pc = personColorFor(userId, members);
              const avatarSize = cents === 0
                ? BUBBLE_MIN
                : BUBBLE_MIN + (Math.abs(cents) / maxAbsBalance) * (BUBBLE_MAX - BUBBLE_MIN);
              return (
                <View key={userId} style={[styles.bubble, { width: Math.max(64, avatarSize + 16) }]}>
                  <View style={[styles.ring, { borderColor: ringColor }]}>
                    <Avatar initials={initials} bg={pc.bg} size={avatarSize} url={member.avatarUrl} />
                  </View>
                  <Text style={[styles.bubbleAmount, { color: amountColor }]}>
                    {sign}{formatCurrency(Math.abs(cents), currency)}
                  </Text>
                  <Text style={styles.bubbleName} numberOfLines={1}>{firstName}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  root: { gap: 12 },
  content: {},

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
  },
  toggleBtn: {
    padding: 6,
    borderRadius: ledgerRadius.sm,
  },

  list: { gap: 0 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 44 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  listName: {
    flex: 1,
    fontFamily: ledgerFonts.bodyMedium,
    fontSize: 13.5,
    color: colors.text.primary,
  },
  listAmount: {
    fontFamily: ledgerFonts.displaySemibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },

  bubbles: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  bubble: {
    alignItems: 'center',
    gap: 4,
    width: 64,
  },
  ring: {
    borderWidth: 2.5,
    borderRadius: 999,
    padding: 2,
  },
  bubbleAmount: {
    fontFamily: ledgerFonts.displaySemibold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  bubbleName: {
    fontFamily: ledgerFonts.bodyMedium,
    fontSize: 11,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
