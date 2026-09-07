import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
};
const VIEW_MODES: BalanceViewMode[] = ['bars', 'list'];

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
});
