import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useCreateTrip } from '../hooks/useCreateTrip';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
import { generateId } from '../../../core/utils/generateId';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Group } from '../../../core/models/Group';
import type { Trip } from '../../../core/models/Trip';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useCreateTrip — group trip', () => {
  let container: ServiceContainer;
  let group: Group;

  beforeEach(async () => {
    container = createTestContainer();
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const owner = auth.currentUser()!;
    const member2 = groupMemberFactory({ userId: 'u2', groupId: 'g1', displayName: 'Sam' });

    group = groupFactory({
      id: 'g1',
      ownerId: owner.id,
      members: [
        groupMemberFactory({ userId: owner.id, groupId: 'g1', displayName: owner.name }),
        member2,
      ],
    });
    container.resolve(TRIP_STORE).getState().appendGroup(group);
  });

  it('saves the trip with groupId set', async () => {
    const { result } = renderHook(() => useCreateTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Group Adventure', 'EUR', { groupId: 'g1' });
    });

    expect(trip?.groupId).toBe('g1');
  });

  it('includes only the creator when selectedGroupMembers is empty', async () => {
    const { result } = renderHook(() => useCreateTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Solo Trip', 'EUR', { groupId: 'g1', selectedGroupMembers: [] });
    });

    expect(trip?.members).toHaveLength(1);
  });

  it('includes all selected group members plus the creator', async () => {
    const { result } = renderHook(() => useCreateTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Full Group Trip', 'EUR', {
        groupId: 'g1',
        selectedGroupMembers: group.members,
      });
    });

    expect(trip?.members).toHaveLength(2);
    const memberIds = trip!.members.map(m => m.userId);
    expect(memberIds).toContain('u2');
  });

  it('does not duplicate the creator when they are also in selectedGroupMembers', async () => {
    const auth = container.resolve(AUTH);
    const owner = auth.currentUser()!;

    const { result } = renderHook(() => useCreateTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('No Dup', 'EUR', {
        groupId: 'g1',
        selectedGroupMembers: group.members,
      });
    });

    const ownerCount = trip!.members.filter(m => m.userId === owner.id).length;
    expect(ownerCount).toBe(1);
  });

  it('appends the trip to the store with groupId', async () => {
    const { result } = renderHook(() => useCreateTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Store Test', 'EUR', { groupId: 'g1' });
    });

    const storeTrips = container.resolve(TRIP_STORE).getState().trips;
    const found = storeTrips.find(t => t.id === trip!.id);
    expect(found?.groupId).toBe('g1');
  });

  it('still works without opts (standalone trip)', async () => {
    const { result } = renderHook(() => useCreateTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Standalone', 'USD');
    });

    expect(trip?.groupId).toBeUndefined();
    expect(trip?.members).toHaveLength(1);
  });

  it('accepts guest members whose userId has a guest_ prefix', async () => {
    // useAddGroupMember produces `guest_${generateId()}` for non-auth members.
    // trip_members.user_id must accept this format (text, not uuid).
    const guestId = `guest_${generateId()}`;
    const guestMember = groupMemberFactory({
      userId:      guestId,
      groupId:     'g1',
      displayName: 'Guest Friend',
      isGuest:     true,
    });

    const { result } = renderHook(() => useCreateTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Guest Trip', 'EUR', {
        groupId:              'g1',
        selectedGroupMembers: [guestMember],
      });
    });

    expect(trip).not.toBeNull();
    expect(trip?.members.some(m => m.userId === guestId)).toBe(true);
    expect(trip?.members.find(m => m.userId === guestId)?.isGuest).toBe(true);
  });
});
