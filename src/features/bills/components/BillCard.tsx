import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Bill } from '../../../core/models/Bill';

interface BillCardProps {
  bill: Bill;
  onPress: (bill: Bill) => void;
  onDelete: (bill: Bill) => void;
}

export function BillCard({ bill, onPress, onDelete }: BillCardProps) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: bill.currency,
  }).format(bill.totalAmount);

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(bill)} activeOpacity={0.8}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {bill.title}
        </Text>
        <Text style={styles.amount}>{formattedAmount}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.meta}>
          {bill.participants.length} participant{bill.participants.length !== 1 ? 's' : ''} ·{' '}
          {bill.createdAt.toLocaleDateString()}
        </Text>
        <TouchableOpacity
          onPress={() => onDelete(bill)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
  deleteText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
  },
});
