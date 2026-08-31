import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SpendPieChart } from '../components/SpendPieChart';
import type { TripMember } from '../../../core/models/TripMember';
import { memberFactory, expenseFactory } from '../../../__testUtils__/factories';


const MEMBERS: TripMember[] = [
  memberFactory({ userId: 'u1', displayName: 'Alice' }),
  memberFactory({ userId: 'u2', displayName: 'Bob' }),
];

describe('SpendPieChart', () => {
  it('renders nothing when there are no expenses', () => {
    const { toJSON } = render(
      <SpendPieChart expenses={[]} members={MEMBERS} currency="EUR" />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders the section title when there is spending data', () => {
    const expenses = [expenseFactory({ id: 'e1', paidByUserId: 'u1', totalAmountCents: 5000 })];
    render(<SpendPieChart expenses={expenses} members={MEMBERS} currency="EUR" />);
    expect(screen.getByText('Spend Breakdown')).toBeTruthy();
  });

  it('shows legend entry for each payer', () => {
    const expenses = [
      expenseFactory({ id: 'e1', paidByUserId: 'u1', totalAmountCents: 6000 }),
      expenseFactory({ id: 'e2', paidByUserId: 'u2', totalAmountCents: 4000 }),
    ];
    render(<SpendPieChart expenses={expenses} members={MEMBERS} currency="EUR" />);
    // Legend: "Alice · €60.00" and "Bob · €40.00"
    expect(screen.getByText(/Alice/)).toBeTruthy();
    expect(screen.getByText(/Bob/)).toBeTruthy();
    expect(screen.getByText(/€60\.00/)).toBeTruthy();
    expect(screen.getByText(/€40\.00/)).toBeTruthy();
  });

  it('ignores members with zero spending', () => {
    // Only u1 paid; u2 has no expenses
    const expenses = [expenseFactory({ id: 'e1', paidByUserId: 'u1', totalAmountCents: 5000 })];
    render(<SpendPieChart expenses={expenses} members={MEMBERS} currency="EUR" />);
    expect(screen.queryByText(/Bob/)).toBeNull();
    expect(screen.getByText(/Alice/)).toBeTruthy();
  });

  it('does not render a duplicate total label (screen already shows the total above the chart)', () => {
    const expenses = [
      expenseFactory({ id: 'e1', paidByUserId: 'u1', totalAmountCents: 3000 }),
      expenseFactory({ id: 'e2', paidByUserId: 'u2', totalAmountCents: 2000 }),
    ];
    render(<SpendPieChart expenses={expenses} members={MEMBERS} currency="EUR" />);
    expect(screen.queryByText('Total: €50.00')).toBeNull();
  });

  it('renders an SVG chart element', () => {
    const expenses = [expenseFactory({ id: 'e1', paidByUserId: 'u1', totalAmountCents: 5000 })];
    render(<SpendPieChart expenses={expenses} members={MEMBERS} currency="EUR" />);
    expect(screen.getByLabelText('Spend breakdown chart')).toBeTruthy();
  });
});
