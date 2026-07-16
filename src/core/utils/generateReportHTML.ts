import { formatCurrency } from './formatCurrency';
import type { ReportData, ReportExpenseEntry, ReportSettlementEntry } from '../models/Report';

const STATUS_LABELS: Record<ReportSettlementEntry['status'], string> = {
  outstanding:  'Outstanding',
  owed:         'Outstanding',
  paid:         'Paid',
  created:      'Pending',
  request_sent: 'Pending',
  authorized:   'Pending',
  pending:      'Pending',
  completed:    'Paid',
  declined:     'Declined',
  expired:      'Expired',
};

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderExpense(expense: ReportExpenseEntry): string {
  const splitRows = expense.splits.map(s => `
      <div class="split-row">
        <span class="split-name">${escapeHTML(s.displayName)}</span>
        <span class="split-amount">${formatCurrency(s.amountOwedCents, expense.currency)}</span>
      </div>`).join('');

  const lineItemRows = expense.lineItems?.length ? `
    <div class="line-items">
      <div class="line-items-title">Items</div>
      ${expense.lineItems.map(item => `
      <div class="split-row">
        <span class="split-name">${escapeHTML(item.description)}${item.assignedNames.length ? ` <span class="assigned">(${escapeHTML(item.assignedNames.join(', '))})</span>` : ''}</span>
        <span class="split-amount">${formatCurrency(item.amountCents, expense.currency)}</span>
      </div>`).join('')}
    </div>` : '';

  const receiptSection = expense.receiptUrl
    ? `<div class="receipt"><img src="${escapeHTML(expense.receiptUrl)}" alt="Receipt" /></div>`
    : '';

  return `
    <div class="expense-card">
      <div class="expense-header">
        <div>
          <div class="expense-desc">${escapeHTML(expense.description)}</div>
          <div class="expense-meta">Paid by ${escapeHTML(expense.payerName)} · ${formatDate(expense.createdAt)}</div>
        </div>
        <div class="expense-amount">${formatCurrency(expense.totalAmountCents, expense.currency)}</div>
      </div>
      <div class="splits">${splitRows}</div>
      ${lineItemRows}
      ${receiptSection}
    </div>`;
}

// Direct group expenses render first (no tripName), followed by each trip's
// own expenses grouped under a heading with the trip's name — so a group
// report clearly shows "this expense came from the Weekend Getaway trip"
// rather than dumping every expense (direct and trip-sourced alike) into one
// undifferentiated list. Trip reports never set tripName, so this is a no-op
// there — everything renders as one flat list, same as before.
function renderExpenseSection(expenses: ReportExpenseEntry[]): string {
  if (expenses.length === 0) return '<div class="empty">No expenses recorded.</div>';

  const direct = expenses.filter(e => !e.tripName);
  const byTrip = new Map<string, ReportExpenseEntry[]>();
  for (const expense of expenses) {
    if (!expense.tripName) continue;
    const list = byTrip.get(expense.tripName) ?? [];
    list.push(expense);
    byTrip.set(expense.tripName, list);
  }

  const directHtml = direct.map(renderExpense).join('');
  const tripHtml = [...byTrip.entries()].map(([tripName, tripExpenses]) => `
    <div class="trip-heading">${escapeHTML(tripName)}</div>
    ${tripExpenses.map(renderExpense).join('')}`).join('');

  return directHtml + tripHtml;
}

function renderSettlement(entry: ReportSettlementEntry): string {
  const label = STATUS_LABELS[entry.status];
  const badgeClass = entry.status === 'paid' || entry.status === 'completed' ? 'badge-paid' : 'badge-outstanding';
  return `
      <div class="settlement-row">
        <span class="settlement-desc">${escapeHTML(entry.fromDisplayName)} owes ${escapeHTML(entry.toDisplayName)}</span>
        <span class="settlement-amount">${formatCurrency(entry.amountCents, entry.currency)}</span>
        <span class="badge ${badgeClass}">${label}</span>
      </div>`;
}

export function generateReportHTML(data: ReportData): string {
  const expenseSection = renderExpenseSection(data.expenses);

  const settlementSection = data.settlements.length
    ? data.settlements.map(renderSettlement).join('')
    : '<div class="empty">All settled.</div>';

  const totalCents = data.expenses.reduce((sum, e) => sum + e.totalAmountCents, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHTML(data.title)} — ouiShare</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      padding: 40px 24px;
      color: #1a1a2e;
    }
    .page { max-width: 640px; margin: 0 auto; }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e8e8f0;
    }
    .logo {
      width: 40px; height: 40px;
      background: #1a1a2e;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .logo-text { color: #ffffff; font-size: 18px; font-weight: 700; }
    .title-block .app-name { font-size: 18px; font-weight: 700; color: #1a1a2e; }
    .title-block .doc-title { font-size: 14px; color: #6b6b8a; margin-top: 2px; }
    .title-block .doc-subtitle { font-size: 12px; color: #9999b0; margin-top: 1px; }
    .summary-bar {
      display: flex; justify-content: space-between; align-items: baseline;
      background: #ffffff; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .summary-label { font-size: 12px; color: #6b6b8a; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { font-size: 24px; font-weight: 700; color: #1a1a2e; }
    .section-title { font-size: 14px; font-weight: 700; color: #1a1a2e; margin: 28px 0 12px; }
    .trip-heading {
      font-size: 12px; font-weight: 700; color: #6b6b8a; text-transform: uppercase; letter-spacing: 0.5px;
      margin: 20px 0 10px; padding-top: 12px; border-top: 1px dashed #e8e8f0;
    }
    .expense-card {
      background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .expense-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .expense-desc { font-size: 15px; font-weight: 600; color: #1a1a2e; }
    .expense-meta { font-size: 12px; color: #6b6b8a; margin-top: 2px; }
    .expense-amount { font-size: 17px; font-weight: 700; color: #1a1a2e; white-space: nowrap; }
    .splits { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid #e8e8f0; }
    .split-row { display: flex; justify-content: space-between; font-size: 13px; }
    .split-name { color: #4b4b6a; }
    .split-name .assigned { color: #9999b0; font-size: 11px; }
    .split-amount { font-weight: 600; color: #1a1a2e; }
    .line-items { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e8e8f0; }
    .line-items-title { font-size: 11px; font-weight: 600; color: #9999b0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .receipt { margin-top: 14px; }
    .receipt img { max-width: 100%; border-radius: 8px; border: 1px solid #e8e8f0; }
    .settlement-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      background: #ffffff; border-radius: 10px; padding: 14px 16px; margin-bottom: 8px;
      box-shadow: 0 1px 6px rgba(0,0,0,0.05);
    }
    .settlement-desc { font-size: 13px; color: #1a1a2e; flex: 1; }
    .settlement-amount { font-size: 14px; font-weight: 700; color: #1a1a2e; }
    .badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }
    .badge-paid { background: #d1fae5; color: #065f46; }
    .badge-outstanding { background: #fee2e2; color: #991b1b; }
    .empty { font-size: 13px; color: #9999b0; padding: 8px 0; }
    .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #9999b0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="logo"><span class="logo-text">o</span></div>
      <div class="title-block">
        <div class="app-name">ouiShare</div>
        <div class="doc-title">${escapeHTML(data.title)}</div>
        <div class="doc-subtitle">${escapeHTML(data.subtitle)}</div>
      </div>
    </div>

    <div class="summary-bar">
      <div>
        <div class="summary-label">Total spend</div>
        <div class="summary-value">${formatCurrency(totalCents, data.currency)}</div>
      </div>
      <div>
        <div class="summary-label">Expenses</div>
        <div class="summary-value">${data.expenses.length}</div>
      </div>
    </div>

    <div class="section-title">Expenses</div>
    ${expenseSection}

    <div class="section-title">Final split &amp; status</div>
    ${settlementSection}

    <div class="footer">
      Generated by ouiShare on ${formatDate(data.generatedAt)}
    </div>
  </div>
</body>
</html>`;
}
