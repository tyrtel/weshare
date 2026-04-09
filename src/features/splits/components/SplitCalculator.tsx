import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Bill } from '../../../core/models/Bill';
import type { Split } from '../../../core/models/Split';

interface SplitCalculatorProps {
  bill: Bill;
  onCalculate: (bill: Bill) => Promise<Split[]>;
}

export function SplitCalculator({ bill, onCalculate }: SplitCalculatorProps) {
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasParticipants = bill.participants.length > 0;
  const perPerson = hasParticipants ? bill.totalAmount / bill.participants.length : 0;

  const formattedPerPerson = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: bill.currency,
  }).format(perPerson);

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      await onCalculate(bill);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed.');
    } finally {
      setCalculating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Equal Split</Text>
      {hasParticipants ? (
        <Text style={styles.summary}>
          {bill.participants.length} participants ·{' '}
          <Text style={styles.highlight}>{formattedPerPerson}</Text> each
        </Text>
      ) : (
        <Text style={styles.noParticipants}>Add participants to the bill first.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, (!hasParticipants || calculating) && styles.disabled]}
        onPress={handleCalculate}
        disabled={!hasParticipants || calculating}
      >
        <Text style={styles.buttonText}>
          {calculating ? 'Calculating…' : 'Apply Equal Split'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 },
  summary: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  highlight: { color: '#2563eb', fontWeight: '700' },
  noParticipants: { fontSize: 13, color: '#9ca3af', marginBottom: 12 },
  error: { color: '#ef4444', fontSize: 13, marginBottom: 8 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
