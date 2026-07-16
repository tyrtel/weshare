import { generateReportHTML } from '../generateReportHTML';
import type { ReportData, ReportExpenseEntry, ReportSettlementEntry } from '../../models/Report';

const NOW = new Date('2025-12-25T12:00:00Z');

function expenseEntry(overrides: Partial<ReportExpenseEntry> = {}): ReportExpenseEntry {
  return {
    id: 'e1',
    description: 'Dinner',
    totalAmountCents: 6000,
    currency: 'EUR',
    payerName: 'Alice',
    createdAt: NOW,
    splits: [
      { userId: 'u1', displayName: 'Alice', amountOwedCents: 3000 },
      { userId: 'u2', displayName: 'Bob', amountOwedCents: 3000 },
    ],
    receiptUrl: null,
    ...overrides,
  };
}

function settlementEntry(overrides: Partial<ReportSettlementEntry> = {}): ReportSettlementEntry {
  return {
    fromDisplayName: 'Bob',
    toDisplayName: 'Alice',
    amountCents: 3000,
    currency: 'EUR',
    status: 'outstanding',
    ...overrides,
  };
}

function reportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    title: 'Amsterdam Trip',
    subtitle: 'Full trip report — all expenses',
    currency: 'EUR',
    expenses: [expenseEntry()],
    settlements: [settlementEntry()],
    generatedAt: NOW,
    ...overrides,
  };
}

describe('generateReportHTML', () => {
  it('returns a valid HTML document', () => {
    const html = generateReportHTML(reportData());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the title and subtitle', () => {
    const html = generateReportHTML(reportData({ title: 'Amsterdam Trip', subtitle: 'Full trip report — all expenses' }));
    expect(html).toContain('Amsterdam Trip');
    expect(html).toContain('Full trip report');
  });

  it('includes each expense description, payer, and amount', () => {
    const html = generateReportHTML(reportData({
      expenses: [expenseEntry({ description: 'Hotel', payerName: 'Charlie', totalAmountCents: 12000 })],
    }));
    expect(html).toContain('Hotel');
    expect(html).toContain('Charlie');
    expect(html).toContain('120');
  });

  it('includes each split row with display name and amount', () => {
    const html = generateReportHTML(reportData({
      expenses: [expenseEntry({
        splits: [{ userId: 'u1', displayName: 'Dana', amountOwedCents: 1500 }],
      })],
    }));
    expect(html).toContain('Dana');
    expect(html).toContain('15');
  });

  it('includes line items with assigned names when present', () => {
    const html = generateReportHTML(reportData({
      expenses: [expenseEntry({
        lineItems: [{ description: 'Wine', amountCents: 2000, assignedNames: ['Alice', 'Bob'] }],
      })],
    }));
    expect(html).toContain('Wine');
    expect(html).toContain('Alice, Bob');
  });

  it('omits the line-items block when there are none', () => {
    const html = generateReportHTML(reportData({ expenses: [expenseEntry({ lineItems: undefined })] }));
    expect(html).not.toContain('class="line-items"');
  });

  it('includes a receipt image when receiptUrl is present', () => {
    const html = generateReportHTML(reportData({
      expenses: [expenseEntry({ receiptUrl: 'https://example.com/signed/receipt.jpg' })],
    }));
    expect(html).toContain('<img src="https://example.com/signed/receipt.jpg"');
  });

  it('omits the receipt section when receiptUrl is null', () => {
    const html = generateReportHTML(reportData({ expenses: [expenseEntry({ receiptUrl: null })] }));
    expect(html).not.toContain('<img');
  });

  it('shows the empty-expenses message when there are no expenses', () => {
    const html = generateReportHTML(reportData({ expenses: [] }));
    expect(html).toContain('No expenses recorded');
  });

  it('groups a trip-sourced expense under a heading with the trip name', () => {
    const html = generateReportHTML(reportData({
      expenses: [
        expenseEntry({ id: 'e1', description: 'Rent' }),
        expenseEntry({ id: 'e2', description: 'Taxi to the cabin', tripName: 'Weekend Getaway' }),
      ],
    }));
    expect(html).toContain('Weekend Getaway');
    expect(html).toContain('Taxi to the cabin');
    // The direct expense (no tripName) renders before the trip heading.
    expect(html.indexOf('Rent')).toBeLessThan(html.indexOf('Weekend Getaway'));
    expect(html.indexOf('Weekend Getaway')).toBeLessThan(html.indexOf('Taxi to the cabin'));
  });

  it('renders no trip heading when every expense is direct (no tripName)', () => {
    const html = generateReportHTML(reportData({
      expenses: [expenseEntry({ description: 'Rent' }), expenseEntry({ id: 'e2', description: 'Groceries' })],
    }));
    expect(html).not.toContain('class="trip-heading"');
  });

  it('shows the all-settled message when there are no settlements', () => {
    const html = generateReportHTML(reportData({ settlements: [] }));
    expect(html).toContain('All settled');
  });

  it('renders a settlement row with names, amount, and Outstanding status', () => {
    const html = generateReportHTML(reportData({
      settlements: [settlementEntry({ fromDisplayName: 'Bob', toDisplayName: 'Alice', amountCents: 4500, status: 'outstanding' })],
    }));
    expect(html).toContain('Bob owes Alice');
    expect(html).toContain('45');
    expect(html).toContain('Outstanding');
  });

  it('renders Paid status for a completed settlement', () => {
    const html = generateReportHTML(reportData({ settlements: [settlementEntry({ status: 'completed' })] }));
    expect(html).toContain('Paid');
  });

  it('renders Declined status for a declined settlement', () => {
    const html = generateReportHTML(reportData({ settlements: [settlementEntry({ status: 'declined' })] }));
    expect(html).toContain('Declined');
  });

  it('escapes HTML in user-supplied text fields', () => {
    const html = generateReportHTML(reportData({
      title: '<script>alert(1)</script>',
      expenses: [expenseEntry({ description: '<b>bold</b>' })],
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>bold</b>');
  });

  it('includes the total spend and expense count summary', () => {
    const html = generateReportHTML(reportData({
      expenses: [expenseEntry({ totalAmountCents: 5000 }), expenseEntry({ id: 'e2', totalAmountCents: 3000 })],
    }));
    expect(html).toContain('80');
  });

  it('includes the generated-on date', () => {
    const html = generateReportHTML(reportData({ generatedAt: NOW }));
    expect(html).toContain('Generated by ouiShare on');
  });
});
