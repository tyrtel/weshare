import { createTestContainer } from '../../../core/di/container';
import { InMemoryStorageService } from '../../../__mocks__/InMemoryStorageService';
import type { Participant } from '../../../core/models/Participant';

describe('Participants feature', () => {
  let storage: InMemoryStorageService;

  beforeEach(() => {
    const container = createTestContainer();
    storage = container.resolve('storageService') as InMemoryStorageService;
  });

  it('saves and retrieves a participant', async () => {
    const participant: Participant = { id: 'p_1', name: 'Alice', contactInfo: '@alice' };
    await storage.saveParticipant(participant);
    const retrieved = await storage.getParticipant('p_1');
    expect(retrieved).toEqual(participant);
  });

  it('returns null for an unknown participant id', async () => {
    const result = await storage.getParticipant('ghost');
    expect(result).toBeNull();
  });

  it('lists all participants', async () => {
    await storage.saveParticipant({ id: 'p_a', name: 'Alice', contactInfo: '' });
    await storage.saveParticipant({ id: 'p_b', name: 'Bob', contactInfo: '' });
    const all = await storage.getAllParticipants();
    expect(all).toHaveLength(2);
  });

  it('updates a participant', async () => {
    const p: Participant = { id: 'p_upd', name: 'Eve', contactInfo: '@old' };
    await storage.saveParticipant(p);
    await storage.updateParticipant({ ...p, contactInfo: '@new' });
    const result = await storage.getParticipant('p_upd');
    expect(result?.contactInfo).toBe('@new');
  });

  it('deletes a participant', async () => {
    await storage.saveParticipant({ id: 'p_del', name: 'Frank', contactInfo: '' });
    await storage.deleteParticipant('p_del');
    const result = await storage.getParticipant('p_del');
    expect(result).toBeNull();
  });
});
