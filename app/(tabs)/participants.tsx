import React, { useEffect } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useParticipants } from '../../src/features/participants/hooks/useParticipants';
import { AddParticipantForm } from '../../src/features/participants/components/AddParticipantForm';
import { ParticipantItem } from '../../src/features/participants/components/ParticipantItem';

export default function ParticipantsScreen() {
  const { participants, fetchParticipants, addParticipant, removeParticipant } =
    useParticipants();

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AddParticipantForm onAdd={addParticipant} />
      <FlatList
        data={participants}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ParticipantItem participant={item} onRemove={removeParticipant} />
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { paddingBottom: 32 },
});
