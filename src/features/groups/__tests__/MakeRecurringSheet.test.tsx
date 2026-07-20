import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());

import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { MockEntitlementService } from '../../../__mocks__/MockEntitlementService';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { MakeRecurringSheet } from '../components/MakeRecurringSheet';
import { expenseFactory, splitFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const EXPENSE = expenseFactory({
  id: 'e1',
  groupId: 'g1',
  description: 'Rent',
  totalAmountCents: 6000,
  splits: [
    splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 3000 }),
    splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 3000 }),
  ],
});

describe('MakeRecurringSheet — monetization count-cap (Chunk G)', () => {
  it('shows the paywall instead of creating a template once the group already has an active rule', async () => {
    const entitlement = new MockEntitlementService();
    entitlement.setActiveRecurringExpenseCount('g1', 1);
    const container = createTestContainer({ entitlementService: entitlement });
    const onSuccess = jest.fn();

    render(
      <MakeRecurringSheet
        visible
        expense={EXPENSE}
        groupId="g1"
        createdByUserId="u1"
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
      { wrapper: makeWrapper(container) },
    );

    fireEvent.press(screen.getByRole('button', { name: 'Set up recurring' }));

    await waitFor(() => expect(screen.getByTestId('paywall-premium-card')).toBeTruthy());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('an active subscription bypasses the count cap and creates the template', async () => {
    const entitlement = new MockEntitlementService();
    entitlement.setActiveRecurringExpenseCount('g1', 1);
    entitlement.grantSubscription(new Date('2099-01-01T00:00:00Z'));
    const container = createTestContainer({ entitlementService: entitlement });
    const onSuccess = jest.fn();

    render(
      <MakeRecurringSheet
        visible
        expense={EXPENSE}
        groupId="g1"
        createdByUserId="u1"
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
      { wrapper: makeWrapper(container) },
    );

    fireEvent.press(screen.getByRole('button', { name: 'Set up recurring' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('paywall-premium-card')).toBeNull();
  });
});
