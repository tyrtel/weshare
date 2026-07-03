import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, type, space, radius } from '../theme';
import { Member } from '../data/mock';
import { Avatar, Money } from './ui';

/**
 * LedgerBars — the app's signature visualization.
 *
 * A shared vertical axis (the "spine") runs down the middle of the card.
 * Each member's net balance extends from the spine: left in coral when they
 * owe the group, right in green when the group owes them. Bars share one
 * scale, so relative debt is readable at a glance before any number is.
 */
export const LedgerBars = ({ balances, members, compact = false }: {
  balances: Record<string, number>;
  members: Record<string, Member>;
  compact?: boolean;
}) => {
  const entries = Object.entries(balances).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => Math.abs(v)));

  return (
    <View>
      {entries.map(([id, cents]) => {
        const m = members[id];
        if (!m) return null;
        const frac = Math.abs(cents) / max; // 0..1 of half-width
        const owed = cents >= 0;
        return (
          <View key={id} style={[styles.row, compact && { marginVertical: 3 }]}>
            {!compact && (
              <View style={styles.who}>
                <Avatar m={m} size={26} />
                <Text style={styles.name} numberOfLines={1}>{m.name}</Text>
              </View>
            )}
            <View style={styles.track}>
              {/* owes side */}
              <View style={styles.half}>
                {!owed && (
                  <View style={[styles.bar, styles.barLeft, {
                    width: `${Math.max(frac * 100, 4)}%`, backgroundColor: palette.owes,
                  }]} />
                )}
              </View>
              {/* the spine */}
              <View style={styles.spine} />
              {/* owed side */}
              <View style={styles.half}>
                {owed && cents !== 0 && (
                  <View style={[styles.bar, styles.barRight, {
                    width: `${Math.max(frac * 100, 4)}%`, backgroundColor: palette.owed,
                  }]} />
                )}
              </View>
            </View>
            <View style={styles.amount}>
              <Money cents={cents} sign size={compact ? 12 : 13}
                color={owed ? palette.owed : palette.owes} />
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 6, gap: space(2) },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 92 },
  name: { fontFamily: type.bodyMed, fontSize: 13, color: palette.ink, flexShrink: 1 },
  track: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 18 },
  half: { flex: 1, height: 10, justifyContent: 'center' },
  spine: { width: 2, height: 18, backgroundColor: palette.lineStrong, borderRadius: 1 },
  bar: { height: 10 },
  barLeft: { alignSelf: 'flex-end', borderTopLeftRadius: radius.pill, borderBottomLeftRadius: radius.pill },
  barRight: { alignSelf: 'flex-start', borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  amount: { width: 74, alignItems: 'flex-end' },
});
