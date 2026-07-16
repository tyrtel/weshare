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
import { groupFactory, groupMemberFactory, expenseFactory, tripFactory } from '../../../src/__testUtils__/factories';
import { AUTH, SHARE, GROUP_REPO } from '../../../src/core/di/tokens';
import type { ServiceContainer } from '../../../src/core/di/ServiceContainer';
import type { MockShareService } from '../../../src/__mocks__/MockShareService';

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
    tripExpenses: {},
    groupExpenses: [],
    activeExpenses: [],
    closedExpenses: [],
    settlements: [],
    memberBalances: MEMBERS.map(m => ({ userId: m.userId, balanceCents: 0 })),
    completedPayments: [],
    loading: false,
    ...overrides,
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
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
