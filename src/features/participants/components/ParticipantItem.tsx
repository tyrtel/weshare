import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Participant } from '../../../core/models/Participant';

interface ParticipantItemProps {
  participant: Participant;
  onRemove: (participant: Participant) => void;
}

export function ParticipantItem({ participant, onRemove }: ParticipantItemProps) {
  const initials = participant.name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{participant.name}</Text>
        {participant.contactInfo ? (
          <Text style={styles.contact}>{participant.contactInfo}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={() => onRemove(participant)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.removeText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  initials: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 14,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  contact: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  removeText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
  },
});
