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
jest.mock('../../../src/core/utils/confirm', () => ({ confirm: jest.fn(() => Promise.resolve(false)) }));

import GroupDetailScreen from '../[id]';
import { useGroupDetail } from '../../../src/features/groups/hooks/useGroupDetail';
import { confirm } from '../../../src/core/utils/confirm';
import { renderScreen } from '../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../src/core/di/testContainer';
import { groupFactory, groupMemberFactory, expenseFactory, tripFactory, memberFactory, splitFactory } from '../../../src/__testUtils__/factories';
import { AUTH, SHARE, GROUP_REPO } from '../../../src/core/di/tokens';
import type { ServiceContainer } from '../../../src/core/di/ServiceContainer';
import type { MockShareService } from '../../../src/__mocks__/MockShareService';

const mockUseGroupDetail = useGroupDetail as jest.Mock;
const mockConfirm        = confirm as jest.Mock;

const MEMBERS = [
  groupMemberFactory({ userId: 'u1', groupId: 'g1', displayName: 'Alice' }),
  groupMemberFactory({ userId: 'u2', groupId: 'g1', displayName: 'Bob' }),
];
const GROUP = groupFactory({ id: 'g1', name: 'Roomies', currency: 'EUR', members: MEMBERS });

const mockCloseExpense = jest.fn(() => Promise.resolve(true));
const mockCloseTrip    = jest.fn(() => Promise.resolve(true));

function setup(overrides: Partial<ReturnType<typeof useGroupDetail>> = {}) {
  mockUseGroupDetail.mockReturnValue({
    group: GROUP,
    activeTrips: [],
    closedTrips: [],
    tripExpenses: {},
    groupExpenses: [],
    activeExpenses: [],
    closedExpenses: [],
    settlements: [],
    memberBalances: MEMBERS.map(m => ({ userId: m.userId, balanceCents: 0 })),
    completedPayments: [],
    archivableExpenseIds: new Set<string>(),
    archivableTripIds: new Set<string>(),
    closeExpense: mockCloseExpense,
    closeTrip: mockCloseTrip,
    loading: false,
    ...overrides,
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockConfirm.mockReset().mockResolvedValue(false);
  mockCloseExpense.mockClear();
  mockCloseTrip.mockClear();
});

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<GroupDetailScreen />, container);
}

describe('GroupDetailScreen', () => {
  it('renders the group name, currency-aware amounts, and the member list', () => {
    setup({
      activeExpenses: [expenseFactory({
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

  it('shows an archive-ready icon on an expense flagged as archivable', () => {
    setup({
      activeExpenses: [expenseFactory({
        id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries',
        totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1',
      })],
      archivableExpenseIds: new Set(['e1']),
    });
    render();

    expect(screen.getByLabelText('Ready to archive — tap to close')).toBeTruthy();
  });

  it('does not show the archive-ready icon on an expense that is not flagged', () => {
    setup({
      activeExpenses: [expenseFactory({
        id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries',
        totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1',
      })],
      archivableExpenseIds: new Set(),
    });
    render();

    expect(screen.queryByLabelText('Ready to archive — tap to close')).toBeNull();
  });

  it('tapping the archive-ready icon confirms and closes the expense in place', async () => {
    setup({
      activeExpenses: [expenseFactory({
        id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries',
        totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1',
      })],
      archivableExpenseIds: new Set(['e1']),
    });
    mockConfirm.mockResolvedValue(true);
    render();

    fireEvent.press(screen.getByLabelText('Ready to archive — tap to close'));

    expect(mockConfirm).toHaveBeenCalledWith('Close this expense?', expect.any(String), 'Close expense');
    await Promise.resolve();
    expect(mockCloseExpense).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not close the expense when the archive confirmation is declined', async () => {
    setup({
      activeExpenses: [expenseFactory({
        id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries',
        totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1',
      })],
      archivableExpenseIds: new Set(['e1']),
    });
    mockConfirm.mockResolvedValue(false);
    render();

    fireEvent.press(screen.getByLabelText('Ready to archive — tap to close'));

    await Promise.resolve();
    expect(mockCloseExpense).not.toHaveBeenCalled();
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
      activeExpenses: [expenseFactory({
        id: 'e1', tripId: undefined, groupId: 'g1', description: 'Groceries',
        totalAmountCents: 3000, currency: 'EUR', paidByUserId: 'u1',
      })],
    });
    render();

    fireEvent.press(screen.getByText('Groceries'));
    expect(mockPush).toHaveBeenCalledWith('/group/expense/e1?groupId=g1');
  });

  // Phase 4c, decision 4: closed trips are hidden behind a "View past items"
  // toggle rather than shown eagerly — the group ledger above already shows
  // any debt they still carry; this is just where to go find/reopen one.
  it('hides closed trips until "View past items" is pressed, then shows them', () => {
    const closedTrip = tripFactory({ id: 't9', name: 'Old Trip', groupId: 'g1', status: 'closed', members: [] });
    setup({ closedTrips: [closedTrip] });
    render();

    expect(screen.queryByText('Old Trip')).toBeNull();
    expect(screen.getByText('View past items')).toBeTruthy();

    fireEvent.press(screen.getByText('View past items'));

    expect(screen.getByText('Old Trip')).toBeTruthy();
    expect(screen.getByText('Hide past items')).toBeTruthy();
  });

  // Closing an expense (not deleting it) hides it behind the same kind of
  // toggle as closed trips — it's still fully part of the group ledger above.
  it('hides closed expenses until "View closed expenses" is pressed, then shows them', () => {
    const closedExpense = expenseFactory({
      id: 'e9', tripId: undefined, groupId: 'g1', description: 'Old Dinner',
      totalAmountCents: 1200, currency: 'EUR', paidByUserId: 'u1',
      settledAt: new Date('2025-06-02T00:00:00Z'),
    });
    setup({ closedExpenses: [closedExpense] });
    render();

    expect(screen.queryByText('Old Dinner')).toBeNull();
    expect(screen.getByText('View closed expenses')).toBeTruthy();

    fireEvent.press(screen.getByText('View closed expenses'));

    expect(screen.getByText('Old Dinner')).toBeTruthy();
    expect(screen.getByText('Hide closed expenses')).toBeTruthy();
  });

  // ── Chunk C (TODO_userMerge.md): unlinked-guest indicator + send invite ──────

  describe('unlinked guest indicator', () => {
    const OWNER_EMAIL = 'owner@example.com';
    const OWNER_ID    = `user_${OWNER_EMAIL}`;
    const guest = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', displayName: 'Jay', isGuest: true });
    const groupWithGuest = groupFactory({ id: 'g1', name: 'Roomies', ownerId: OWNER_ID, currency: 'EUR', members: [...MEMBERS, guest] });

    async function renderAsOwner() {
      const container = createTestContainer();
      await container.resolve(AUTH).signIn(OWNER_EMAIL, 'password');
      await container.resolve(GROUP_REPO).saveGroup(groupWithGuest);
      setup({ group: groupWithGuest });
      render(container);
      return container;
    }

    it('shows the unlinked indicator only to the owner', async () => {
      await renderAsOwner();
      expect(screen.getByLabelText('Hasn\'t joined yet — tap to send an invite')).toBeTruthy();
    });

    it('hides the unlinked indicator for a non-owner', () => {
      setup({ group: groupWithGuest });
      render(); // no signed-in user

      expect(screen.queryByLabelText('Hasn\'t joined yet — tap to send an invite')).toBeNull();
    });

    it('tapping the unlinked guest opens the send-invite sheet pre-filled with their email', async () => {
      const guestWithEmail = { ...guest, email: 'jay@example.com' };
      const groupVariant = groupFactory({ id: 'g1', name: 'Roomies', ownerId: OWNER_ID, currency: 'EUR', members: [...MEMBERS, guestWithEmail] });
      const container = createTestContainer();
      await container.resolve(AUTH).signIn(OWNER_EMAIL, 'password');
      await container.resolve(GROUP_REPO).saveGroup(groupVariant);
      setup({ group: groupVariant });
      render(container);

      fireEvent.press(screen.getByLabelText('Hasn\'t joined yet — tap to send an invite'));

      expect(screen.getByText('Send an invite')).toBeTruthy();
      expect(screen.getByDisplayValue('jay@example.com')).toBeTruthy();
    });

    it('confirming the sheet saves the email and shares the invite link', async () => {
      const { waitFor } = require('@testing-library/react-native');
      const container = await renderAsOwner();

      fireEvent.press(screen.getByLabelText('Hasn\'t joined yet — tap to send an invite'));
      fireEvent.changeText(screen.getByLabelText('Email'), 'jay@example.com');
      fireEvent.press(screen.getByLabelText('Send invite'));

      // Let the sendInvite promise chain (repo write + share call + setInviteTarget(null)) settle.
      await waitFor(async () => {
        const stored = await container.resolve(GROUP_REPO).getGroup('g1');
        expect(stored.ok && stored.value.members.find(m => m.userId === 'guest_1')?.email).toBe('jay@example.com');
      });

      const share = container.resolve(SHARE) as MockShareService;
      expect(share.groupCalls).toHaveLength(1);
      await waitFor(() => expect(screen.queryByText('Send an invite')).toBeNull());
    });
  });

  describe('settle-up hint', () => {
    it('shows a hint about settling everything at once alongside the Settle up button', () => {
      setup({
        memberBalances: [{ userId: 'u1', balanceCents: 1000 }, { userId: 'u2', balanceCents: -1000 }],
        settlements: [{ fromUserId: 'u2', toUserId: 'u1', amountCents: 1000, currency: 'EUR' }],
      });
      render();

      expect(screen.getByText('Settle up')).toBeTruthy();
      expect(screen.getByText('Pay individually, or settle everything at once')).toBeTruthy();
    });

    it('hides the hint when there is nothing to settle', () => {
      setup({ memberBalances: MEMBERS.map(m => ({ userId: m.userId, balanceCents: 0 })), settlements: [] });
      render();

      expect(screen.queryByText('Pay individually, or settle everything at once')).toBeNull();
    });

    // Regression: the settle-up button used to disappear entirely once a group had
    // no outstanding debts, leaving no way to reach /group/settle/[id] (balances +
    // payment history) at all.
    it('still shows a way to reach the settlement screen when there is nothing to settle', () => {
      setup({ memberBalances: MEMBERS.map(m => ({ userId: m.userId, balanceCents: 0 })), settlements: [] });
      render();

      expect(screen.getByText('View settlement')).toBeTruthy();
      expect(screen.getByText('Everyone is settled up — see balances and payment history')).toBeTruthy();
      fireEvent.press(screen.getByText('View settlement'));
      expect(mockPush).toHaveBeenCalledWith('/group/settle/g1');
    });
  });

  // Regression: trip rows in a group used to show only the trip name — no
  // indication of what the current user personally owes or is owed on it,
  // unlike the same trip's card on the home screen.
  describe('trip rows — per-trip standing', () => {
    it("shows a balance pill reflecting the current user's standing on that trip", async () => {
      const OWNER_EMAIL = 'owner@example.com';
      const OWNER_ID = `user_${OWNER_EMAIL}`;
      const container = createTestContainer();
      await container.resolve(AUTH).signIn(OWNER_EMAIL, 'password');

      const trip = tripFactory({
        id: 't1', name: 'Ski Trip', groupId: 'g1', currency: 'EUR',
        members: [
          memberFactory({ userId: OWNER_ID, displayName: 'Owner' }),
          memberFactory({ userId: 'u2', displayName: 'Bob' }),
        ],
      });

      setup({
        activeTrips: [trip],
        tripExpenses: {
          t1: [expenseFactory({
            id: 'e1', tripId: 't1', groupId: undefined, totalAmountCents: 4000, currency: 'EUR', paidByUserId: 'u2',
            splits: [
              splitFactory({ id: 's1', expenseId: 'e1', userId: OWNER_ID, amountOwedCents: 2000 }),
              splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 2000 }),
            ],
          })],
        },
      });

      render(container);

      expect(screen.getByText(/Ski Trip/)).toBeTruthy();
      expect(screen.getByText('−€20.00')).toBeTruthy();
    });

    it('shows no pill for a trip with no expenses yet', () => {
      const trip = tripFactory({ id: 't1', name: 'New Trip', groupId: 'g1', currency: 'EUR', members: [] });
      setup({ activeTrips: [trip], tripExpenses: { t1: [] } });

      render();

      expect(screen.getByText(/New Trip/)).toBeTruthy();
      expect(screen.queryByText(/€/)).toBeNull();
    });

    it('shows an archive-ready icon on a trip flagged as archivable', () => {
      const trip = tripFactory({ id: 't1', name: 'Ski Trip', groupId: 'g1', currency: 'EUR', members: [] });
      setup({ activeTrips: [trip], tripExpenses: { t1: [] }, archivableTripIds: new Set(['t1']) });

      render();

      expect(screen.getByLabelText('Ready to archive — tap to close')).toBeTruthy();
    });

    it('tapping the archive-ready icon confirms and closes the trip in place', async () => {
      const trip = tripFactory({ id: 't1', name: 'Ski Trip', groupId: 'g1', currency: 'EUR', members: [] });
      setup({ activeTrips: [trip], tripExpenses: { t1: [] }, archivableTripIds: new Set(['t1']) });
      mockConfirm.mockResolvedValue(true);

      render();
      fireEvent.press(screen.getByLabelText('Ready to archive — tap to close'));

      expect(mockConfirm).toHaveBeenCalledWith('Close this trip?', expect.any(String), 'Close trip');
      await Promise.resolve();
      expect(mockCloseTrip).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('does not close the trip when the archive confirmation is declined', async () => {
      const trip = tripFactory({ id: 't1', name: 'Ski Trip', groupId: 'g1', currency: 'EUR', members: [] });
      setup({ activeTrips: [trip], tripExpenses: { t1: [] }, archivableTripIds: new Set(['t1']) });
      mockConfirm.mockResolvedValue(false);

      render();
      fireEvent.press(screen.getByLabelText('Ready to archive — tap to close'));

      await Promise.resolve();
      expect(mockCloseTrip).not.toHaveBeenCalled();
    });
  });

  describe('recent payments', () => {
    it('shows up to 3 payments, most recent first', () => {
      setup({
        completedPayments: [
          { payerUserId: 'u1', payeeUserId: 'u2', amountCents: 1000, currency: 'EUR', id: 'p1', date: new Date('2026-01-01') },
          { payerUserId: 'u2', payeeUserId: 'u1', amountCents: 2000, currency: 'EUR', id: 'p2', date: new Date('2026-03-01') },
          { payerUserId: 'u1', payeeUserId: 'u2', amountCents: 3000, currency: 'EUR', id: 'p3', date: new Date('2026-02-01') },
          { payerUserId: 'u2', payeeUserId: 'u1', amountCents: 4000, currency: 'EUR', id: 'p4', date: new Date('2025-12-01') },
        ],
      });
      render();

      expect(screen.getByText('Recent Payments')).toBeTruthy();
      // p4 (Dec) is the 4th most recent — should be excluded, only top 3 shown.
      expect(screen.queryByText('€40.00')).toBeNull();
      expect(screen.getByText('€20.00')).toBeTruthy();
      expect(screen.getByText('€30.00')).toBeTruthy();
      expect(screen.getByText('€10.00')).toBeTruthy();
    });

    it('hides the section entirely when there are no completed payments', () => {
      setup({ completedPayments: [] });
      render();

      expect(screen.queryByText('Recent Payments')).toBeNull();
    });

    it('navigates to the pairwise audit screen when a payment is pressed', () => {
      setup({
        completedPayments: [
          { payerUserId: 'u2', payeeUserId: 'u1', amountCents: 1000, currency: 'EUR', id: 'p1', date: new Date('2026-01-01') },
        ],
      });
      render();

      fireEvent.press(screen.getByText('Bob paid Alice'));

      expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
        pathname: '/group/settle/audit/g1',
        params: expect.objectContaining({ groupId: 'g1', fromUserId: 'u2', toUserId: 'u1', fromName: 'Bob', toName: 'Alice' }),
      }));
    });
  });
});
