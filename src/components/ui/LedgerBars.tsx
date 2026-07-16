import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { useColors } from '../../theme/colors';
import type { ColorPalette } from '../../theme/colors';
import { ledgerRadius, ledgerFonts } from '../../theme/tokens';
import { formatCurrency } from '../../core/utils/formatCurrency';

interface LedgerBarsProps {
  balances: Record<string, number>;
  members: Array<{ userId: string; displayName: string; avatarUrl?: string }>;
  compact?: boolean;
}

export function LedgerBars({ balances, members, compact = false }: LedgerBarsProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const memberMap = new Map(members.map(m => [m.userId, m]));
  const entries = Object.entries(balances).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => Math.abs(v)));

  return (
    <View>
      {entries.map(([userId, cents]) => {
        const member = memberMap.get(userId);
        if (!member) return null;
        const frac = Math.abs(cents) / max;
        const isOwed = cents >= 0;
        const initials = member.displayName.trim().charAt(0).toUpperCase();
        const amountText = `${isOwed ? '+' : '−'}${formatCurrency(Math.abs(cents), 'EUR')}`;

        return (
          <View key={userId} style={[styles.row, compact && styles.rowCompact]}>
            {!compact && (
              <View style={styles.who}>
                <Avatar
                  initials={initials}
                  bg={colors.primary.subtle}
                  size="sm"
                  url={member.avatarUrl}
                />
                <Text style={styles.name} numberOfLines={1}>{member.displayName}</Text>
              </View>
            )}
            <View style={styles.track}>
              <View style={styles.half}>
                {!isOwed && (
                  <View style={[styles.bar, styles.barLeft, {
                    width: `${Math.max(frac * 100, 4)}%`,
                    backgroundColor: colors.error.default,
                  }]} />
                )}
              </View>
              <View style={styles.spine} />
              <View style={styles.half}>
                {isOwed && cents !== 0 && (
                  <View style={[styles.bar, styles.barRight, {
                    width: `${Math.max(frac * 100, 4)}%`,
                    backgroundColor: colors.success.default,
                  }]} />
                )}
              </View>
            </View>
            <View style={styles.amount}>
              <Text style={[styles.amountText, { color: isOwed ? colors.success.default : colors.error.default }]}>
                {amountText}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 8,
  },
  rowCompact: { marginVertical: 3 },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 92,
  },
  name: {
    fontFamily: ledgerFonts.bodyMedium,
    fontSize: 13,
    color: colors.text.primary,
    flexShrink: 1,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 18,
  },
  half: {
    flex: 1,
    height: 10,
    justifyContent: 'center',
  },
  spine: {
    width: 2,
    height: 18,
    backgroundColor: colors.borderMuted,
    borderRadius: 1,
  },
  bar: { height: 10 },
  barLeft: {
    alignSelf: 'flex-end',
    borderTopLeftRadius: ledgerRadius.pill,
    borderBottomLeftRadius: ledgerRadius.pill,
  },
  barRight: {
    alignSelf: 'flex-start',
    borderTopRightRadius: ledgerRadius.pill,
    borderBottomRightRadius: ledgerRadius.pill,
  },
  amount: {
    width: 74,
    alignItems: 'flex-end',
  },
  amountText: {
    fontFamily: ledgerFonts.displaySemibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
