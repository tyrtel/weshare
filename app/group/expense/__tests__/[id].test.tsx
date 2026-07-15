import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule } from '../../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());

const mockSearchParams = jest.fn(() => ({ id: 'e1', groupId: 'g1' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams(),
  Stack: { Screen: () => null },
}));

import GroupExpenseDetailScreen from '../[id]';
import { renderScreen } from '../../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../../src/core/di/testContainer';
import { TRIP_STORE, AUTH } from '../../../../src/core/di/tokens';
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
});
