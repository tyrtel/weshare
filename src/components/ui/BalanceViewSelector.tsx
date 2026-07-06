import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { LedgerBars } from './LedgerBars';
import { Segmented } from './Segmented';
import type { BalanceViewMode } from '../../core/hooks/useBalanceView';
import { ledgerColors } from '../../theme/colors';
import { ledgerRadius, ledgerFonts } from '../../theme/tokens';
import { formatCurrency } from '../../core/utils/formatCurrency';

const VIEW_OPTIONS = [
  { key: 'bars', label: 'Bars' },
  { key: 'list', label: 'List' },
  { key: 'bubbles', label: 'Bubbles' },
];

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
  const memberMap = new Map(members.map(m => [m.userId, m]));
  const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.root}>
      <Segmented
        options={VIEW_OPTIONS}
        value={viewMode}
        onChange={(k) => onChangeView(k as BalanceViewMode)}
      />

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
                ? ledgerColors.text.tertiary
                : isOwed ? ledgerColors.success.default : ledgerColors.error.default;
              const sign = cents === 0 ? '' : isOwed ? '+' : '−';
              const initials = member.displayName.trim().charAt(0).toUpperCase();
              return (
                <View key={userId}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.listRow}>
                    <Avatar initials={initials} bg={ledgerColors.primary.subtle} size="sm" url={member.avatarUrl} />
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
                ? ledgerColors.border
                : isOwed ? ledgerColors.success.default : ledgerColors.error.default;
              const amountColor = cents === 0
                ? ledgerColors.text.tertiary
                : isOwed ? ledgerColors.success.default : ledgerColors.error.default;
              const sign = cents === 0 ? '' : isOwed ? '+' : '−';
              const initials = member.displayName.trim().charAt(0).toUpperCase();
              const firstName = member.displayName.split(' ')[0];
              return (
                <View key={userId} style={styles.bubble}>
                  <View style={[styles.ring, { borderColor: ringColor }]}>
                    <Avatar initials={initials} bg={ledgerColors.primary.subtle} size="md" url={member.avatarUrl} />
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

const styles = StyleSheet.create({
  root: { gap: 12 },
  content: {},

  list: { gap: 0 },
  divider: { height: 1, backgroundColor: ledgerColors.border, marginLeft: 44 },
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
    color: ledgerColors.text.primary,
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
    color: ledgerColors.text.secondary,
    textAlign: 'center',
  },
});
