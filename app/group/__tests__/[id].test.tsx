import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule, mockSafeAreaModule } from '../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());
jest.mock('react-native-safe-area-context', () => mockSafeAreaModule());

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: 'g1' }),
}));

jest.mock('../../../src/features/groups/hooks/useGroupDetail', () => ({
  useGroupDetail: jest.fn(),
}));

import GroupDetailScreen from '../[id]';
import { useGroupDetail } from '../../../src/features/groups/hooks/useGroupDetail';
import { renderScreen } from '../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../src/core/di/testContainer';
import { groupFactory, groupMemberFactory, expenseFactory } from '../../../src/__testUtils__/factories';

const mockUseGroupDetail = useGroupDetail as jest.Mock;

const MEMBERS = [
  groupMemberFactory({ userId: 'u1', groupId: 'g1', displayName: 'Alice' }),
  groupMemberFactory({ userId: 'u2', groupId: 'g1', displayName: 'Bob' }),
];
const GROUP = groupFactory({ id: 'g1', name: 'Roomies', currency: 'EUR', members: MEMBERS });

function setup(overrides: Partial<ReturnType<typeof useGroupDetail>> = {}) {
  mockUseGroupDetail.mockReturnValue({
    group: GROUP,
    activeTrips: [],
    closedTrips: [],
    activeGroupExpenses: [],
    settledGroupExpenses: [],
    settlements: [],
    memberBalances: MEMBERS.map(m => ({ userId: m.userId, balanceCents: 0 })),
    loading: false,
    ...overrides,
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
});

function render() {
  return renderScreen(<GroupDetailScreen />, createTestContainer());
}

describe('GroupDetailScreen', () => {
  it('renders the group name, currency-aware amounts, and the member list', () => {
    setup({
      activeGroupExpenses: [expenseFactory({
        id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries',
        totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1',
      })],
    });
    render();

    expect(screen.getByText(/Roomies/)).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
    // Regression check: the screen used to read a nonexistent `expense.amountCents`
    // field, rendering "NaN" instead of the real total.
    expect(screen.getByText('€30.00')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('shows "All settled" when every member balance is zero', () => {
    setup({ memberBalances: MEMBERS.map(m => ({ userId: m.userId, balanceCents: 0 })) });
    render();

    expect(screen.getByText('All settled')).toBeTruthy();
  });

  it('shows a "Settle up" action when settlements exist', () => {
    setup({
      memberBalances: [{ userId: 'u1', balanceCents: 1000 }, { userId: 'u2', balanceCents: -1000 }],
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1000, currency: 'EUR' }],
    });
    render();

    expect(screen.queryByText('All settled')).toBeNull();
    expect(screen.getByText('Settle up')).toBeTruthy();
    fireEvent.press(screen.getByText('Settle up'));
    expect(mockPush).toHaveBeenCalledWith('/group/settle/g1');
  });

  it('tapping an expense row navigates to its detail screen', () => {
    setup({
      activeGroupExpenses: [expenseFactory({
        id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries',
        totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1',
      })],
    });
    render();

    fireEvent.press(screen.getByText('Groceries'));
    expect(mockPush).toHaveBeenCalledWith('/group/expense/e1?groupId=g1');
  });
});
