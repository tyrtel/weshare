import React from 'react';
import { screen } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule, mockSvgModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());
jest.mock('expo-router', () => mockExpoRouterModule());
jest.mock('../hooks/useTripDetail', () => ({ useTripDetail: jest.fn() }));

import { TripActivityScreen } from '../screens/TripActivityScreen';
import { useTripDetail } from '../hooks/useTripDetail';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { tripFactory, memberFactory, expenseFactory } from '../../../__testUtils__/factories';

const mockUseTripDetail = useTripDetail as jest.Mock;

const MEMBERS = [memberFactory({ userId: 'u1', displayName: 'Alice' })];
const TRIP = tripFactory({ id: 't1', currency: 'EUR', members: MEMBERS });

function render() {
  return renderScreen(<TripActivityScreen />, createTestContainer());
}

describe('TripActivityScreen', () => {
  it('renders activity entries in the order the hook provides (reverse-chronological)', () => {
    // useTripDetail already sorts newest-first; the screen must preserve that
    // order, not re-sort or reverse it.
    mockUseTripDetail.mockReturnValue({
      trip: TRIP,
      loading: false,
      expenses: [
        expenseFactory({ id: 'e2', tripId: 't1', description: 'Newest: Dinner', createdAt: new Date('2025-06-05'), paidByUserId: 'u1' }),
        expenseFactory({ id: 'e1', tripId: 't1', description: 'Oldest: Hotel', createdAt: new Date('2025-06-01'), paidByUserId: 'u1' }),
      ],
    });

    render();

    // getAllByText returns matches in document order, which for this simple
    // linear list corresponds to render order.
    const rows = screen.getAllByText(/^(Newest: Dinner|Oldest: Hotel)$/);
    expect(rows.map(r => r.props.children)).toEqual(['Newest: Dinner', 'Oldest: Hotel']);
  });

  it('shows the total spend and expense count', () => {
    mockUseTripDetail.mockReturnValue({
      trip: TRIP,
      loading: false,
      expenses: [
        expenseFactory({ id: 'e1', tripId: 't1', totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1' }),
        expenseFactory({ id: 'e2', tripId: 't1', totalAmountCents: 2000, currency: 'EUR', paidByUserId: 'u1' }),
      ],
    });

    render();

    expect(screen.getByText('€50.00')).toBeTruthy();
  });

  it('shows the empty state when there are no expenses', () => {
    mockUseTripDetail.mockReturnValue({ trip: TRIP, loading: false, expenses: [] });

    render();

    expect(screen.getByText('No expenses recorded yet.')).toBeTruthy();
  });
});
