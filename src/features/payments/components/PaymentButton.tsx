import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import type { PaymentRequest } from '../../../core/interfaces/IPaymentService';

interface PaymentButtonProps {
  request: PaymentRequest;
  providerName: string;
  onPay: (request: PaymentRequest) => Promise<void>;
}

const PROVIDER_COLORS: Record<string, string> = {
  Venmo: '#3D95CE',
  Revolut: '#191C1F',
  Mock: '#6b7280',
};

export function PaymentButton({ request, providerName, onPay }: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const backgroundColor = PROVIDER_COLORS[providerName] ?? '#2563eb';

  const handlePress = async () => {
    setLoading(true);
    try {
      await onPay(request);
    } catch (e) {
      Alert.alert(
        'Payment unavailable',
        e instanceof Error
          ? e.message
          : `Could not open ${providerName}. Please make sure the app is installed.`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor }, loading && styles.disabled]}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.85}
    >
      <Text style={styles.text}>
        {loading ? 'Opening…' : `Pay via ${providerName}`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginVertical: 6,
  },
  disabled: { opacity: 0.55 },
  text: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
