import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Split } from '../../../core/models/Split';

interface SplitItemProps {
  split: Split;
  participantName: string;
  currency: string;
  onSettle: (split: Split) => void;
}

export function SplitItem({ split, participantName, currency, onSettle }: SplitItemProps) {
  const formattedOwed = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(split.amountOwed);

  return (
    <View style={[styles.container, split.settled && styles.settledContainer]}>
      <View style={styles.info}>
        <Text style={styles.name}>{participantName}</Text>
        <Text style={styles.amount}>{formattedOwed}</Text>
      </View>
      {split.settled ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Settled</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.settleButton} onPress={() => onSettle(split)}>
          <Text style={styles.settleText}>Mark Settled</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginVertical: 4,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  settledContainer: {
    backgroundColor: '#f0fdf4',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  amount: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  settleButton: {
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settleText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#bbf7d0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '700',
  },
});
