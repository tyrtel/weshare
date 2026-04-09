import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { Participant } from '../../../core/models/Participant';

interface AddParticipantFormProps {
  onAdd: (data: Omit<Participant, 'id'>) => Promise<void>;
}

export function AddParticipantForm({ onAdd }: AddParticipantFormProps) {
  const [name, setName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Validation error', 'Please enter a name.');
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({ name: name.trim(), contactInfo: contactInfo.trim() });
      setName('');
      setContactInfo('');
    } catch {
      Alert.alert('Error', 'Failed to add participant.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Add Participant</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Alice Smith"
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.label}>Venmo / Revolut handle (optional)</Text>
      <TextInput
        style={styles.input}
        value={contactInfo}
        onChangeText={setContactInfo}
        placeholder="@handle or phone number"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.disabled]}
        onPress={handleAdd}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>{submitting ? 'Adding…' : 'Add Participant'}</Text>
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
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
