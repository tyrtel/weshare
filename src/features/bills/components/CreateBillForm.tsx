import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import type { Bill } from '../../../core/models/Bill';

type BillFormData = Pick<Bill, 'title' | 'totalAmount' | 'currency' | 'participants'>;

interface CreateBillFormProps {
  onSubmit: (data: BillFormData) => Promise<void>;
}

export function CreateBillForm({ onSubmit }: CreateBillFormProps) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!title.trim()) {
      Alert.alert('Validation error', 'Please enter a bill title.');
      return;
    }
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Validation error', 'Please enter a positive amount.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), totalAmount: parsed, currency, participants: [] });
      setTitle('');
      setAmount('');
    } catch {
      Alert.alert('Error', 'Failed to create bill. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>New Bill</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Dinner at Joe's"
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.label}>Amount</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.currencyInput]}
          value={currency}
          onChangeText={(v) => setCurrency(v.toUpperCase())}
          maxLength={3}
          placeholderTextColor="#9ca3af"
        />
        <TextInput
          style={[styles.input, styles.amountInput]}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          placeholderTextColor="#9ca3af"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>{submitting ? 'Creating…' : 'Create Bill'}</Text>
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
  heading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  currencyInput: {
    width: 64,
    textAlign: 'center',
    fontWeight: '700',
  },
  amountInput: {
    flex: 1,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
