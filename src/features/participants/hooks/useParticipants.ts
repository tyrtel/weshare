import { useState, useCallback } from 'react';
import { useContainer } from '../../../core/di/ServiceContext';
import type { Participant } from '../../../core/models/Participant';

export function useParticipants() {
  const storage = useContainer().resolve('storageService');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await storage.getAllParticipants();
      setParticipants(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load participants.'));
    } finally {
      setLoading(false);
    }
  }, [storage]);

  const addParticipant = useCallback(
    async (data: Omit<Participant, 'id'>): Promise<Participant> => {
      const participant: Participant = {
        ...data,
        id: `participant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
      await storage.saveParticipant(participant);
      setParticipants((prev) => [...prev, participant]);
      return participant;
    },
    [storage],
  );

  const removeParticipant = useCallback(
    async (participantOrId: Participant | string) => {
      const id =
        typeof participantOrId === 'string' ? participantOrId : participantOrId.id;
      await storage.deleteParticipant(id);
      setParticipants((prev) => prev.filter((p) => p.id !== id));
    },
    [storage],
  );

  return { participants, loading, error, fetchParticipants, addParticipant, removeParticipant };
}
