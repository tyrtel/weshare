import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PaymentButton } from '../../src/features/payments/components/PaymentButton';
import { usePayments } from '../../src/features/payments/hooks/usePayments';

export default function PaymentsScreen() {
  const { pay, providerName } = usePayments();

  // In a real app this screen would receive a Split + Participant from navigation params.
  const sampleRequest = {
    recipientHandle: '@friend',
    amount: 25.0,
    currency: 'USD',
    note: 'WeShare bill split',
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>Send Payment</Text>
        <Text style={styles.sub}>
          Tap the button below to open {providerName} and complete the transfer.
        </Text>
        <PaymentButton
          request={sampleRequest}
          providerName={providerName}
          onPay={pay}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 24 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 28, lineHeight: 20 },
});
