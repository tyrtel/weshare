import React from 'react';
import { Alert } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule } from '../../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: 'g1' }),
  Stack: { Screen: () => null },
}));

jest.mock('../../../../src/features/groups/hooks/useGroupDetail', () => ({
  useGroupDetail: jest.fn(),
}));

import GroupSettlementScreen from '../[id]';
import { useGroupDetail } from '../../../../src/features/groups/hooks/useGroupDetail';
import { renderScreen } from '../../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../../src/core/di/testContainer';
import { EXPENSE_REPO, TRIP_STORE } from '../../../../src/core/di/tokens';
import { groupFactory, groupMemberFactory, expenseFactory, splitFactory } from '../../../../src/__testUtils__/factories';
import type { ServiceContainer } from '../../../../src/core/di/ServiceContainer';

const mockUseGroupDetail = useGroupDetail as jest.Mock;

const MEMBERS = [
  groupMemberFactory({ userId: 'u1', groupId: 'g1', displayName: 'Alice' }),
  groupMemberFactory({ userId: 'u2', groupId: 'g1', displayName: 'Bob' }),
];
const GROUP = groupFactory({ id: 'g1', name: 'Roomies', currency: 'EUR', members: MEMBERS });

beforeEach(() => {
  mockBack.mockClear();
});

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<GroupSettlementScreen />, container);
}

describe('GroupSettlementScreen', () => {
  it('renders each suggested transfer with the correctly summed amount', () => {
    mockUseGroupDetail.mockReturnValue({
      group: GROUP,
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1500, currency: 'EUR' }],
      memberBalances: [
        { userId: 'u1', balanceCents: 1500 },
        { userId: 'u2', balanceCents: -1500 },
      ],
    });

    render();

    expect(screen.getByText('Bob → Alice')).toBeTruthy();
    expect(screen.getByText('€15.00')).toBeTruthy();
    expect(screen.getByText('+€15.00')).toBeTruthy();
    expect(screen.getByText('−€15.00')).toBeTruthy();
  });

  it('confirming "Mark everything settled" settles group expenses and navigates back', async () => {
    const container = createTestContainer();
    const expense = expenseFactory({
      id: 'e1', tripId: undefined, groupId: 'g1', currency: 'EUR',
      totalAmountCents: 1500, paidByUserId: 'u1', settledAt: null,
      splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 0 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 1500 }),
      ],
    });
    const store = container.resolve(TRIP_STORE);
    store.getState().appendGroup(GROUP);
    store.getState().appendGroupExpense(expense);
    await container.resolve(EXPENSE_REPO).saveExpense(expense);

    mockUseGroupDetail.mockReturnValue({
      group: GROUP,
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1500, currency: 'EUR' }],
      memberBalances: [
        { userId: 'u1', balanceCents: 1500 },
        { userId: 'u2', balanceCents: -1500 },
      ],
    });

    render(container);

    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.[1]?.onPress?.();
    });

    fireEvent.press(screen.getByText('Mark everything settled'));

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

    const stored = await container.resolve(EXPENSE_REPO).getExpense('e1');
    expect(stored.ok && stored.value.settledAt).not.toBeNull();
  });

  it('shows the all-settled state when there are no outstanding transfers', () => {
    mockUseGroupDetail.mockReturnValue({
      group: GROUP,
      settlements: [],
      memberBalances: [
        { userId: 'u1', balanceCents: 0 },
        { userId: 'u2', balanceCents: 0 },
      ],
    });

    render();

    expect(screen.getByText('Everyone is settled up.')).toBeTruthy();
    expect(screen.queryByText('Mark everything settled')).toBeNull();
  });
});
