import React from 'react';
import { Alert } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule } from '../../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());

const mockSearchParams = jest.fn(() => ({ id: 'e1', groupId: 'g1' }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockSearchParams(),
  Stack: { Screen: () => null },
}));

import GroupExpenseDetailScreen from '../[id]';
import { renderScreen } from '../../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../../src/core/di/testContainer';
import { TRIP_STORE, AUTH, EXPENSE_REPO } from '../../../../src/core/di/tokens';
import { groupFactory, groupMemberFactory, expenseFactory, splitFactory } from '../../../../src/__testUtils__/factories';
import type { ServiceContainer } from '../../../../src/core/di/ServiceContainer';

async function seed(container: ServiceContainer, expenseOverrides: Parameters<typeof expenseFactory>[0] = {}) {
  const members = [
    groupMemberFactory({ userId: 'u1', groupId: 'g1', displayName: 'Alice' }),
    groupMemberFactory({ userId: 'u2', groupId: 'g1', displayName: 'Bob' }),
  ];
  const group   = groupFactory({ id: 'g1', currency: 'EUR', members });
  const expense = expenseFactory({
    id: 'e1', tripId: undefined, groupId: 'g1', description: 'Pizza',
    totalAmountCents: 4000, paidByUserId: 'u1', settledAt: null,
    splits: [
      splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 2000 }),
      splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 2000 }),
    ],
    ...expenseOverrides,
  });

  const store = container.resolve(TRIP_STORE);
  store.getState().appendGroup(group);
  store.getState().appendGroupExpense(expense);

  return { group, expense, members };
}

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<GroupExpenseDetailScreen />, container);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams.mockReturnValue({ id: 'e1', groupId: 'g1' });
});

describe('GroupExpenseDetailScreen', () => {
  it('renders description, total, payer, and splits from the group store', async () => {
    const container = createTestContainer();
    await seed(container);
    render(container);

    expect(screen.getByText('Pizza')).toBeTruthy();
    expect(screen.getByText('€40.00')).toBeTruthy();
    // "Alice" appears once as payer and once in the split row.
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    // Both split rows render with their own amount.
    expect(screen.getAllByText('€20.00')).toHaveLength(2);
  });

  // Phase 4c: the per-expense "Mark as settled" button/badge is retired
  // entirely — settling an expense no longer affects the group ledger, so
  // there's nothing left for it to mean. This holds regardless of whatever
  // legacy `settledAt` value an expense happens to carry.
  it('never renders a settle button or "Settled" badge, settled or not', async () => {
    const container = createTestContainer();
    await seed(container, { settledAt: new Date('2025-06-02T00:00:00Z') });
    render(container);

    expect(screen.queryByText('Mark as settled')).toBeNull();
    expect(screen.queryByText('Settled')).toBeNull();
  });

  it('"Make recurring" opens the recurring setup sheet', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');
    await seed(container);
    render(container);

    fireEvent.press(screen.getByText('Make recurring'));

    expect(screen.getAllByText('Set up recurring').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the receipt image when the expense has one', async () => {
    const container = createTestContainer();
    await seed(container, { metadata: { receiptUrl: 'u1/e1.jpg' } });
    render(container);

    expect(screen.getByText('Receipt')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Receipt image')).toBeTruthy());
  });

  it('does not render a receipt section when the expense has none', async () => {
    const container = createTestContainer();
    await seed(container);
    render(container);

    expect(screen.queryByText('Receipt')).toBeNull();
  });

  describe('close / reopen', () => {
    it('shows both a close button and a delete button', async () => {
      const container = createTestContainer();
      await seed(container);
      render(container);

      expect(screen.getByText('Close expense')).toBeTruthy();
      expect(screen.getByText('Delete expense')).toBeTruthy();
    });

    it('closes the expense and navigates back on confirm, without removing it', async () => {
      const container = createTestContainer();
      await seed(container);
      const expenseRepo = container.resolve(EXPENSE_REPO);
      await expenseRepo.saveExpense(expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: null }));

      // confirm()'s button order is [confirmButton, cancelButton] — press index 0.
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[0]?.onPress?.();
      });

      render(container);
      fireEvent.press(screen.getByText('Close expense'));

      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

      const remaining = container.resolve(TRIP_STORE).getState().groupExpenses['g1'];
      const closed = remaining?.find(e => e.id === 'e1');
      expect(closed).toBeTruthy();
      expect(closed?.settledAt).toBeTruthy();
    });

    it('does not close when the confirmation is cancelled', async () => {
      const container = createTestContainer();
      await seed(container);

      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[1]?.onPress?.();
      });

      render(container);
      fireEvent.press(screen.getByText('Close expense'));

      expect(mockBack).not.toHaveBeenCalled();
      const remaining = container.resolve(TRIP_STORE).getState().groupExpenses['g1'];
      expect(remaining?.find(e => e.id === 'e1')?.settledAt).toBeNull();
    });

    it('shows a reopen button for a closed expense, and reopens it without navigating away', async () => {
      const container = createTestContainer();
      await seed(container, { settledAt: new Date('2025-06-02T00:00:00Z') });
      const expenseRepo = container.resolve(EXPENSE_REPO);
      await expenseRepo.saveExpense(expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: new Date('2025-06-02T00:00:00Z') }));

      render(container);

      expect(screen.getByText('Reopen expense')).toBeTruthy();
      fireEvent.press(screen.getByText('Reopen expense'));

      await waitFor(() => {
        const remaining = container.resolve(TRIP_STORE).getState().groupExpenses['g1'];
        expect(remaining?.find(e => e.id === 'e1')?.settledAt).toBeNull();
      });
      expect(mockBack).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the expense and navigates back on confirm', async () => {
      const container = createTestContainer();
      await seed(container);
      const expenseRepo = container.resolve(EXPENSE_REPO);
      await expenseRepo.saveExpense(expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: null }));

      // confirm()'s button order is [confirmButton, cancelButton] — press index 0.
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[0]?.onPress?.();
      });

      render(container);
      fireEvent.press(screen.getByText('Delete expense'));

      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

      const remaining = container.resolve(TRIP_STORE).getState().groupExpenses['g1'];
      expect(remaining?.find(e => e.id === 'e1')).toBeUndefined();
    });

    it('does not delete when the confirmation is cancelled', async () => {
      const container = createTestContainer();
      await seed(container);

      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[1]?.onPress?.();
      });

      render(container);
      fireEvent.press(screen.getByText('Delete expense'));

      expect(mockBack).not.toHaveBeenCalled();
      const remaining = container.resolve(TRIP_STORE).getState().groupExpenses['g1'];
      expect(remaining?.find(e => e.id === 'e1')).toBeTruthy();
    });
  });
});
