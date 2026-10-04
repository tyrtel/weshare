import { mockExpoRouterModule, mockVectorIconsModule } from '../../../../__testUtils__/standardMocks';

jest.mock('expo-router', () => mockExpoRouterModule());
jest.mock('@expo/vector-icons', () => mockVectorIconsModule());

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { ActivityFeedItem } from '../ActivityFeedItem';
import type { ActivityEvent } from '../../../../core/models/ActivityEvent';
import type { Group } from '../../../../core/models/Group';
import type { Trip } from '../../../../core/models/Trip';

const group: Group = { id: 'g1', name: 'Roomies', currency: 'EUR', ownerId: 'u1', createdAt: new Date(), members: [] };
const trip: Trip = {
  id: 't1', name: 'Lisbon', currency: 'EUR', createdAt: new Date(), ownerId: 'u1', members: [],
  status: 'active', closedAt: null,
};

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'e1', eventType: 'expense.created', entityType: 'expense', entityId: 'exp1',
    groupId: 'g1', tripId: null, expenseId: 'exp1', actorUserId: 'u1',
    payload: { description: 'Dinner' }, createdAt: new Date('2026-09-01T12:00:00Z'),
    ...overrides,
  };
}

describe('ActivityFeedItem', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders the created-event description with the expense name', () => {
    render(<ActivityFeedItem event={makeEvent()} groups={[group]} trips={[trip]} />);
    expect(screen.getByText('Added "Dinner"')).toBeTruthy();
  });

  it('renders the group breadcrumb segment for a group-scoped expense', () => {
    render(<ActivityFeedItem event={makeEvent()} groups={[group]} trips={[trip]} />);
    expect(screen.getByText('Roomies')).toBeTruthy();
  });

  it('navigates to the group when its breadcrumb segment is pressed', () => {
    render(<ActivityFeedItem event={makeEvent()} groups={[group]} trips={[trip]} />);
    fireEvent.press(screen.getByText('Roomies'));
    expect(useRouter().push).toHaveBeenCalledWith('/group/g1');
  });

  it('renders a deleted expense description without a linkable expense segment', () => {
    render(
      <ActivityFeedItem
        event={makeEvent({ eventType: 'expense.deleted' })}
        groups={[group]}
        trips={[trip]}
      />,
    );
    expect(screen.getByText('Deleted "Dinner"')).toBeTruthy();
    // The expense label renders as plain text (not pressable) once deleted.
    const label = screen.getByText('Dinner');
    fireEvent.press(label);
    expect(useRouter().push).not.toHaveBeenCalled();
  });
});
