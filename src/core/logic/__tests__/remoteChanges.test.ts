import { bucketsForChange } from '../remoteChanges';
import type { RemoteChange } from '../../interfaces/IRealtimeService';
import type { TripSessionState } from '../../interfaces/ITripSessionStore';
import { expenseFactory, splitRequestFactory, recurringExpenseFactory } from '../../../__testUtils__/factories';

const EMPTY = {
  trips: [], groups: [], expenses: {}, members: {}, splitRequests: {}, groupSplitRequests: {},
  groupExpenses: {}, recurringExpenses: {}, fetchedAt: {},
} as unknown as TripSessionState;

function change(table: RemoteChange['table'], type: RemoteChange['type'], rec: Record<string, unknown>): RemoteChange {
  return type === 'DELETE' ? { table, type, row: null, old: rec } : { table, type, row: rec, old: null };
}

describe('bucketsForChange', () => {
  it('maps list tables to their list bucket', () => {
    expect(bucketsForChange(change('trips', 'UPDATE', { id: 't1' }), EMPTY)).toEqual(['trips']);
    expect(bucketsForChange(change('groups', 'INSERT', { id: 'g1' }), EMPTY)).toEqual(['groups']);
    expect(bucketsForChange(change('group_members', 'DELETE', { group_id: 'g1', user_id: 'u1' }), EMPTY)).toEqual(['groups']);
  });

  it('maps a trip member change to that trip and the trips list (avatars)', () => {
    expect(bucketsForChange(change('trip_members', 'INSERT', { trip_id: 't1', user_id: 'u2' }), EMPTY))
      .toEqual(['trip:t1', 'trips']);
  });

  it('maps expenses by trip or group', () => {
    expect(bucketsForChange(change('expenses', 'INSERT', { id: 'e1', trip_id: 't1', group_id: null }), EMPTY)).toEqual(['trip:t1']);
    expect(bucketsForChange(change('expenses', 'UPDATE', { id: 'e1', trip_id: null, group_id: 'g1' }), EMPTY)).toEqual(['group:g1']);
  });

  it('recovers a deleted expense\'s bucket from the cache, or ignores it', () => {
    const state = {
      ...EMPTY,
      expenses: { t1: [expenseFactory({ id: 'e1', tripId: 't1' })] },
      groupExpenses: { g1: [expenseFactory({ id: 'e2', tripId: undefined, groupId: 'g1' })] },
    } as TripSessionState;
    expect(bucketsForChange(change('expenses', 'DELETE', { id: 'e1' }), state)).toEqual(['trip:t1']);
    expect(bucketsForChange(change('expenses', 'DELETE', { id: 'e2' }), state)).toEqual(['group:g1']);
    expect(bucketsForChange(change('expenses', 'DELETE', { id: 'unknown' }), state)).toEqual([]);
  });

  it('maps split requests by scope, including deletes from the cache', () => {
    const state = { ...EMPTY, groupSplitRequests: { g1: [splitRequestFactory({ id: 'r9', groupId: 'g1' })] } } as TripSessionState;
    expect(bucketsForChange(change('split_requests', 'INSERT', { id: 'r1', trip_id: 't1' }), EMPTY)).toEqual(['tripRequests:t1']);
    expect(bucketsForChange(change('split_requests', 'UPDATE', { id: 'r1', group_id: 'g1' }), EMPTY)).toEqual(['groupRequests:g1']);
    expect(bucketsForChange(change('split_requests', 'DELETE', { id: 'r9' }), state)).toEqual(['groupRequests:g1']);
  });

  it('maps recurring expenses to their group, including deletes from the cache', () => {
    const state = { ...EMPTY, recurringExpenses: { g1: [recurringExpenseFactory({ id: 'rec1', groupId: 'g1' })] } } as TripSessionState;
    expect(bucketsForChange(change('recurring_expenses', 'UPDATE', { id: 'rec1', group_id: 'g1' }), EMPTY)).toEqual(['recurring:g1']);
    expect(bucketsForChange(change('recurring_expenses', 'DELETE', { id: 'rec1' }), state)).toEqual(['recurring:g1']);
  });
});
