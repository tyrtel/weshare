import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBills } from '../../src/features/bills/hooks/useBills';
import { BillList } from '../../src/features/bills/components/BillList';
import { CreateBillForm } from '../../src/features/bills/components/CreateBillForm';
import type { Bill } from '../../src/core/models/Bill';

export default function BillsScreen() {
  const { bills, loading, error, fetchBills, createBill, deleteBill } = useBills();

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const handleBillPress = (_bill: Bill) => {
    // TODO: navigate to bill detail screen with expo-router push
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <CreateBillForm onSubmit={createBill} />
      <BillList
        bills={bills}
        loading={loading}
        error={error}
        onBillPress={handleBillPress}
        onBillDelete={deleteBill}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
});
