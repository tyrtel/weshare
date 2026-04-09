import React from 'react';
import { FlatList, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { Bill } from '../../../core/models/Bill';
import { BillCard } from './BillCard';

interface BillListProps {
  bills: Bill[];
  loading: boolean;
  error: Error | null;
  onBillPress: (bill: Bill) => void;
  onBillDelete: (bill: Bill) => void;
}

export function BillList({ bills, loading, error, onBillPress, onBillDelete }: BillListProps) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    );
  }

  if (bills.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No bills yet. Create one above to get started.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={bills}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <BillCard bill={item} onPress={onBillPress} onDelete={onBillDelete} />
      )}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  list: {
    paddingVertical: 8,
    paddingBottom: 32,
  },
});
