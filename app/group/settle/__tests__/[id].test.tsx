import React from 'react';
import { Alert } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule } from '../../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
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
import { SPLIT_REQUEST_REPO, TRIP_STORE } from '../../../../src/core/di/tokens';
import { groupFactory, groupMemberFactory, expenseFactory, tripFactory } from '../../../../src/__testUtils__/factories';
import type { ServiceContainer } from '../../../../src/core/di/ServiceContainer';

const mockUseGroupDetail = useGroupDetail as jest.Mock;

const MEMBERS = [
  groupMemberFactory({ userId: 'u1', groupId: 'g1', displayName: 'Alice' }),
  groupMemberFactory({ userId: 'u2', groupId: 'g1', displayName: 'Bob' }),
];
const GROUP = groupFactory({ id: 'g1', name: 'Roomies', currency: 'EUR', members: MEMBERS });

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
});

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<GroupSettlementScreen />, container);
}

// useGroupDetail always returns arrays (never undefined) for these fields —
// this mirrors that contract so tests don't have to repeat empty defaults.
function mockDetail(overrides: Partial<ReturnType<typeof useGroupDetail>>) {
  mockUseGroupDetail.mockReturnValue({
    activeTrips: [],
    activeExpenses: [],
    completedPayments: [],
    ...overrides,
  });
}

describe('GroupSettlementScreen', () => {
  it('renders each suggested transfer with the correctly summed amount', () => {
    mockDetail({
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

  it('confirming "Settle everything" records a completed payment for each settlement and navigates back', async () => {
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    store.getState().appendGroup(GROUP);

    mockDetail({
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

    fireEvent.press(screen.getByText('Settle everything'));

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup('g1');
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value).toHaveLength(1);
    expect(stored.value[0]).toMatchObject({ payerUserId: 'u2', requesterUserId: 'u1', amountCents: 1500, status: 'paid' });
  });

  it('shows the all-settled state when there are no outstanding transfers', () => {
    mockDetail({
      group: GROUP,
      settlements: [],
      memberBalances: [
        { userId: 'u1', balanceCents: 0 },
        { userId: 'u2', balanceCents: 0 },
      ],
    });

    render();

    expect(screen.getByText('Everyone is settled up.')).toBeTruthy();
    expect(screen.queryByText('Settle everything')).toBeNull();
  });

  // Regression: the all-settled state used to be a dead end — just a checkmark,
  // no way to see what actually happened in the group recently.
  describe('all-settled state — recent activity and payment history', () => {
    const ALL_EVEN_ARGS = {
      group: GROUP,
      settlements: [],
      memberBalances: [
        { userId: 'u1', balanceCents: 0 },
        { userId: 'u2', balanceCents: 0 },
      ],
    };

    it('lists standalone expenses and trips from the last 30 days, most recent first', () => {
      const now = Date.now();
      mockDetail({
        ...ALL_EVEN_ARGS,
        activeExpenses: [
          expenseFactory({ id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries', totalAmountCents: 2000, currency: 'EUR', createdAt: new Date(now - 5 * 86400000) }),
        ],
        activeTrips: [
          tripFactory({ id: 't1', groupId: 'g1', name: 'Weekend in Ghent', createdAt: new Date(now - 2 * 86400000) }),
        ],
      });

      render();

      const activitySection = screen.getByText('Recent activity');
      expect(activitySection).toBeTruthy();
      expect(screen.getByText('Weekend in Ghent')).toBeTruthy();
      expect(screen.getByText('Groceries')).toBeTruthy();
      expect(screen.getByText('€20.00')).toBeTruthy();
    });

    it('excludes activity older than 30 days', () => {
      const now = Date.now();
      mockDetail({
        ...ALL_EVEN_ARGS,
        activeExpenses: [
          expenseFactory({ id: 'e1', tripId: undefined, groupId: 'g1', description: 'Old dinner', totalAmountCents: 1000, currency: 'EUR', createdAt: new Date(now - 45 * 86400000) }),
        ],
      });

      render();

      expect(screen.queryByText('Recent activity')).toBeNull();
      expect(screen.queryByText('Old dinner')).toBeNull();
    });

    it('lists completed payments with who paid whom, the date, and the amount', () => {
      mockDetail({
        ...ALL_EVEN_ARGS,
        completedPayments: [
          { id: 'p1', payerUserId: 'u2', payeeUserId: 'u1', amountCents: 1500, currency: 'EUR', date: new Date('2026-06-01') },
        ],
      });

      render();

      expect(screen.getByText('Payment history')).toBeTruthy();
      expect(screen.getByText('Bob paid Alice')).toBeTruthy();
      expect(screen.getByText('€15.00')).toBeTruthy();
    });

    it('tapping a payment history row navigates to the audit screen', () => {
      mockDetail({
        ...ALL_EVEN_ARGS,
        completedPayments: [
          { id: 'p1', payerUserId: 'u2', payeeUserId: 'u1', amountCents: 1500, currency: 'EUR', date: new Date('2026-06-01') },
        ],
      });

      render();
      fireEvent.press(screen.getByText('Bob paid Alice'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/group/settle/audit/g1',
        params: { groupId: 'g1', fromUserId: 'u2', toUserId: 'u1', fromName: 'Bob', toName: 'Alice' },
      });
    });

    it('hides both sections when there is no recent activity or payment history', () => {
      mockDetail(ALL_EVEN_ARGS);

      render();

      expect(screen.queryByText('Recent activity')).toBeNull();
      expect(screen.queryByText('Payment history')).toBeNull();
    });
  });

  // Phase 4d — tapping a transfer navigates to the shared, group-scoped ledger view.
  it('tapping a transfer navigates to the group-scoped ledger history', () => {
    mockDetail({
      group: GROUP,
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1500, currency: 'EUR' }],
      memberBalances: [
        { userId: 'u1', balanceCents: 1500 },
        { userId: 'u2', balanceCents: -1500 },
      ],
    });

    render();
    fireEvent.press(screen.getByText('Bob → Alice'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/group/settle/audit/g1',
      params: { groupId: 'g1', fromUserId: 'u2', toUserId: 'u1', fromName: 'Bob', toName: 'Alice' },
    });
  });

  // Phase 4d — per-pair "Record" action, using the same RecordPaymentSheet trip uses.
  it('recording a payment for one transfer calls recordPayment with the entered amount', async () => {
    const recordPayment = jest.fn().mockResolvedValue(undefined);
    mockDetail({
      group: GROUP,
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1500, currency: 'EUR' }],
      memberBalances: [
        { userId: 'u1', balanceCents: 1500 },
        { userId: 'u2', balanceCents: -1500 },
      ],
      recordPayment,
      recording: false,
    });

    render();
    fireEvent.press(screen.getByLabelText('Record a payment from Bob to Alice'));
    fireEvent.press(screen.getByLabelText('Confirm recorded payment'));

    await waitFor(() => expect(recordPayment).toHaveBeenCalledWith('u2', 'u1', 1500, 'EUR'));
  });
});
