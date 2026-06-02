import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PayoutSection } from '../components/PayoutSection';
import type { Settlement } from '../../../core/models/Settlement';
import type { TripMember } from '../../../core/models/TripMember';
import { memberFactory } from '../../../__testUtils__/factories';

const NOW = new Date('2025-06-01T12:00:00Z');

const MEMBERS: TripMember[] = [
  memberFactory({ userId: 'u1', displayName: 'Alice' }),
  memberFactory({ userId: 'u2', displayName: 'Bob' }),
  memberFactory({ userId: 'u3', displayName: 'Claire' }),
];

const SETTLEMENTS: Settlement[] = [
  { fromUserId: 'u2', toUserId: 'u1', amountCents: 3000, currency: 'EUR' },
  { fromUserId: 'u3', toUserId: 'u1', amountCents: 1500, currency: 'EUR' },
];

describe('PayoutSection', () => {
  it('shows "All settled up!" when there are no settlements', () => {
    render(<PayoutSection settlements={[]} members={MEMBERS} currency="EUR" />);
    expect(screen.getByText('All settled up!')).toBeTruthy();
  });

  it('renders debtor and creditor names for each settlement', () => {
    render(<PayoutSection settlements={SETTLEMENTS} members={MEMBERS} currency="EUR" />);
    // Both settlements share Alice as creditor; Bob and Claire are debtors
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Claire')).toBeTruthy();
  });

  it('renders one card per settlement', () => {
    render(<PayoutSection settlements={SETTLEMENTS} members={MEMBERS} currency="EUR" />);
    // Each settlement shows an amount — verify both amounts are present
    expect(screen.getByText('€30.00')).toBeTruthy();
    expect(screen.getByText('€15.00')).toBeTruthy();
  });

  it('uses userId as fallback when member is not found', () => {
    const orphan: Settlement = { fromUserId: 'unknown', toUserId: 'u1', amountCents: 500, currency: 'EUR' };
    render(<PayoutSection settlements={[orphan]} members={MEMBERS} currency="EUR" />);
    expect(screen.getByText('unknown')).toBeTruthy();
  });

  it('renders the section title', () => {
    render(<PayoutSection settlements={[]} members={MEMBERS} currency="EUR" />);
    expect(screen.getByText('Settle Up')).toBeTruthy();
  });
});
