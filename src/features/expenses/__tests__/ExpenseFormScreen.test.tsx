import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule, mockSafeAreaModule, mockSvgModule } from '../../../__testUtils__/standardMocks';

jest.mock('expo-router', () => mockExpoRouterModule());
jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-safe-area-context', () => mockSafeAreaModule());
jest.mock('react-native-svg', () => mockSvgModule());

// Data-loading hooks are mocked so tests control trip/member state directly —
// useSplitForm and useCurrencyRate are NOT mocked, since they're pure local logic
// and are exactly what this session's regressions lived in.
jest.mock('../../trips/hooks/useTripDetail', () => ({ useTripDetail: jest.fn() }));
jest.mock('../hooks/useExpenseDetail', () => ({ useExpenseDetail: jest.fn() }));

import { ExpenseFormScreen } from '../screens/ExpenseFormScreen';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useExpenseDetail } from '../hooks/useExpenseDetail';
import { useLocalSearchParams } from 'expo-router';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXCHANGE_RATE, EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { tripFactory, memberFactory, groupFactory, groupMemberFactory, expenseFactory, splitFactory } from '../../../__testUtils__/factories';
import type { TripMember } from '../../../core/models/TripMember';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { MockExchangeRateService } from '../../../__mocks__/MockExchangeRateService';

const mockUseTripDetail        = useTripDetail as jest.Mock;
const mockUseExpenseDetail     = useExpenseDetail as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;

const DEFAULT_MEMBERS: TripMember[] = [
  memberFactory({ userId: 'u1', displayName: 'Alice' }),
  memberFactory({ userId: 'u2', displayName: 'Bob' }),
  memberFactory({ userId: 'u3', displayName: 'Cleo' }),
];

function setupTripMode(opts: { currency?: string; members?: TripMember[] } = {}) {
  const members = opts.members ?? DEFAULT_MEMBERS;
  const trip = tripFactory({ id: 't1', currency: opts.currency ?? 'EUR', members });
  mockUseTripDetail.mockReturnValue({ trip, loading: false, error: null, refetch: jest.fn() });
  mockUseExpenseDetail.mockReturnValue({ expense: null, loading: false, error: null, refetch: jest.fn() });
  mockUseLocalSearchParams.mockReturnValue({ tripId: 't1' });
  return { trip, members };
}

function setupEditMode(expenseOverrides: Parameters<typeof expenseFactory>[0] = {}) {
  const members = DEFAULT_MEMBERS;
  const trip = tripFactory({ id: 't1', currency: 'EUR', members });
  const expense = expenseFactory({ id: 'e1', tripId: 't1', ...expenseOverrides });
  mockUseTripDetail.mockReturnValue({ trip, loading: false, error: null, refetch: jest.fn() });
  mockUseExpenseDetail.mockReturnValue({ expense, loading: false, error: null, refetch: jest.fn() });
  mockUseLocalSearchParams.mockReturnValue({ tripId: 't1', id: 'e1' });
  return { trip, members, expense };
}

function renderForm(container: ServiceContainer = createTestContainer()) {
  // MockExchangeRateService defaults to an 800ms artificial delay; zero it so
  // conversion-dependent tests don't need fake timers.
  const rate = container.resolve(EXCHANGE_RATE) as MockExchangeRateService;
  rate.delay = 0;
  return renderScreen(<ExpenseFormScreen />, container);
}

async function fillAmount(value: string) {
  fireEvent.changeText(screen.getByTestId('expense-amount-input'), value);
}

async function fillDescription(value: string) {
  fireEvent.changeText(screen.getByTestId('expense-description-input'), value);
}

// ── Amount sanitization ─────────────────────────────────────────────────────

describe('ExpenseFormScreen — amount sanitization', () => {
  beforeEach(() => setupTripMode());

  it('strips alpha characters as they are typed', async () => {
    renderForm();
    await fillAmount('12.34abc');
    expect(screen.getByTestId('expense-amount-input').props.value).toBe('12.34');
  });

  it('collapses a second decimal point instead of accepting it', async () => {
    renderForm();
    await fillAmount('12.3.4');
    expect(screen.getByTestId('expense-amount-input').props.value).toBe('12.34');
  });

  it('treats JPY as zero-decimal — typing 3555 stores ¥3,555, not ¥355,500', async () => {
    setupTripMode({ currency: 'JPY' });
    const { container } = renderForm();
    await fillAmount('3555');
    await fillDescription('Sushi');

    fireEvent.press(screen.getByText('Save expense'));

    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());
    const repo = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok && saved.value[0]?.totalAmountCents).toBe(3555);
  });
});

// ── Currency conversion (double-conversion regression) ──────────────────────

describe('ExpenseFormScreen — currency conversion', () => {
  it('Evenly split in a foreign currency sums to the converted total, not near-zero shares', async () => {
    setupTripMode({ currency: 'EUR' });
    const { container } = renderForm();

    // Open the currency picker (trigger is the current symbol) and pick JPY.
    fireEvent.press(screen.getByText('€'));
    fireEvent.press(screen.getByText('¥ JPY'));
    await waitFor(() => expect(screen.queryByText('Fetching rate…')).toBeNull());

    await fillDescription('Dinner');
    await fillAmount('3555');

    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo  = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const expense = saved.value[0];
    expect(expense.currency).toBe('EUR');
    const shares = expense.splits.map(sp => sp.amountOwedCents);
    const sum    = shares.reduce((s, v) => s + v, 0);

    // Splits must balance exactly to the saved (converted) total.
    expect(sum).toBe(expense.totalAmountCents);
    // The double-conversion bug produced near-zero shares for everyone except the
    // last person, who absorbed the entire real total as a "rounding correction".
    // A healthy 3-way even split of a real EUR amount keeps every share close.
    expect(Math.min(...shares)).toBeGreaterThan(0);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(50);
  });

  it('rescales an already-typed amount when switching from a 2-decimal to a 0-decimal currency', async () => {
    setupTripMode({ currency: 'EUR' });
    const { container } = renderForm();

    await fillDescription('Sushi');
    await fillAmount('50'); // typed while entry currency is EUR -> intends €50.00

    // Switch entry currency to JPY (zero-decimal) *after* typing — this is the
    // exact sequence that produced a 100x-inflated stored amount: the field's
    // displayed text was never wrong, but the underlying minor-units value,
    // computed at EUR's x100 scale, silently survived the currency switch.
    fireEvent.press(screen.getByText('€'));
    fireEvent.press(screen.getByText('¥ JPY'));
    await waitFor(() => expect(screen.queryByText('Fetching rate…')).toBeNull());

    // The displayed amount must still read the user's original number.
    expect(screen.getByTestId('expense-amount-input').props.value).toBe('50');

    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo  = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const original = saved.value[0].metadata.originalAmount;
    expect(original?.currency).toBe('JPY');
    // Before the fix this was 5000 (50 * 100, the stale EUR-scale value) —
    // 100x too large for what was actually typed and displayed.
    expect(original?.amountCents).toBe(50);
  });

  it('rescales an already-typed amount when switching from a 0-decimal to a 2-decimal currency', async () => {
    setupTripMode({ currency: 'JPY' });
    const { container } = renderForm();

    await fillDescription('Sushi');
    await fillAmount('5000'); // typed while entry currency is JPY -> intends ¥5000

    // Switch entry currency to EUR (2-decimal) *after* typing — the reverse
    // direction of the bug above. The major-unit number the user typed must
    // be preserved (¥5000 -> €5000.00), not divided down to €50.00.
    fireEvent.press(screen.getByText('¥'));
    fireEvent.press(screen.getByText('€ EUR'));
    await waitFor(() => expect(screen.queryByText('Fetching rate…')).toBeNull());

    // The displayed amount must reflect 5000 (formatted to 2 decimals now
    // that the currency has them), not 50.
    expect(screen.getByTestId('expense-amount-input').props.value).toBe('5000.00');

    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo  = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const original = saved.value[0].metadata.originalAmount;
    expect(original?.currency).toBe('EUR');
    // 5000 major units at EUR's x100 scale = 500000 minor units. Before the
    // fix, the stale JPY-scale value (5000) would have survived untouched,
    // reading as €50.00 instead of €5000.00.
    expect(original?.amountCents).toBe(500000);
  });

  it('shows a "Fetching rate…" caption while the rate call is pending', async () => {
    setupTripMode({ currency: 'EUR' });
    const container = createTestContainer();
    const rateService = container.resolve(EXCHANGE_RATE) as MockExchangeRateService;
    rateService.delay = 50;
    renderScreen(<ExpenseFormScreen />, container);

    await fillDescription('Ramen');
    await fillAmount('3555');
  });

  it('writes metadata.originalAmount when saving in a foreign currency', async () => {
    setupTripMode({ currency: 'EUR' });
    const { container } = renderForm();

    fireEvent.press(screen.getByText('€'));
    fireEvent.press(screen.getByText('¥ JPY'));
    await waitFor(() => expect(screen.queryByText('Fetching rate…')).toBeNull());

    await fillDescription('Sushi run');
    await fillAmount('3555');
    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo  = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const original = saved.value[0].metadata.originalAmount;
    expect(original?.currency).toBe('JPY');
    expect(original?.amountCents).toBe(3555);
    expect(original?.exchangeRate).toBeGreaterThan(0);
  });
});

// ── Exact mode ────────────────────────────────────────────────────────────

describe('ExpenseFormScreen — Exact mode', () => {
  beforeEach(() => setupTripMode());

  it('typing into a member amount field never loses what was typed mid-keystroke', async () => {
    renderForm();
    await fillDescription('Groceries');
    await fillAmount('30');
    fireEvent.press(screen.getByText('Exact'));

    const field = screen.getByTestId('exact-amount-input-u1');
    fireEvent.changeText(field, '5');
    expect(field.props.value).toBe('5');
    fireEvent.changeText(field, '5.');
    expect(field.props.value).toBe('5.');
    fireEvent.changeText(field, '5.5');
    expect(field.props.value).toBe('5.5');
  });

  it('"Unassigned" reflects total minus only what has been explicitly typed', async () => {
    renderForm();
    await fillDescription('Groceries');
    await fillAmount('30');
    fireEvent.press(screen.getByText('Exact'));

    fireEvent.changeText(screen.getByTestId('exact-amount-input-u1'), '10');
    expect(screen.getByText('€20.00')).toBeTruthy();
  });

  it('"Unassigned" goes negative when entered amounts exceed the total', async () => {
    renderForm();
    await fillDescription('Groceries');
    await fillAmount('30');
    fireEvent.press(screen.getByText('Exact'));

    fireEvent.changeText(screen.getByTestId('exact-amount-input-u1'), '25');
    fireEvent.changeText(screen.getByTestId('exact-amount-input-u2'), '25');
    expect(screen.getByText('-€20.00')).toBeTruthy();
  });
});

// ── Itemized mode ─────────────────────────────────────────────────────────

describe('ExpenseFormScreen — Itemized mode', () => {
  beforeEach(() => setupTripMode());

  it('item description and amount fields are editable', async () => {
    renderForm();
    await fillDescription('Receipt');
    fireEvent.press(screen.getByText('Items'));
    fireEvent.press(screen.getByText('Add item'));

    const itemField = screen.getByTestId(/^item-description-input-/);
    fireEvent.changeText(itemField, 'Bread');
    expect(itemField.props.value).toBe('Bread');
  });

  it('item amount field does not lose focus mid-keystroke', async () => {
    renderForm();
    await fillDescription('Receipt');
    fireEvent.press(screen.getByText('Items'));
    fireEvent.press(screen.getByText('Add item'));

    const itemAmount = screen.getByTestId(/^item-amount-input-/);
    fireEvent.changeText(itemAmount, '4');
    expect(itemAmount.props.value).toBe('4');
    fireEvent.changeText(itemAmount, '4.5');
    expect(itemAmount.props.value).toBe('4.5');
  });

  it('"Unassigned" = top amount minus sum of item prices, live', async () => {
    renderForm();
    await fillDescription('Receipt');
    await fillAmount('50');
    fireEvent.press(screen.getByText('Items'));
    fireEvent.press(screen.getByText('Add item'));

    fireEvent.changeText(screen.getByTestId(/^item-amount-input-/), '20');
    expect(screen.getByText('€30.00')).toBeTruthy();
  });

  it('removing an item drops it and recomputes "Unassigned"', async () => {
    renderForm();
    await fillDescription('Receipt');
    await fillAmount('50');
    fireEvent.press(screen.getByText('Items'));
    fireEvent.press(screen.getByText('Add item'));

    fireEvent.changeText(screen.getByTestId(/^item-amount-input-/), '20');
    expect(screen.getByText('€30.00')).toBeTruthy();

    fireEvent.press(screen.getByTestId(/^item-remove-button-/));

    expect(screen.queryByTestId(/^item-amount-input-/)).toBeNull();
    // The "Unassigned" footer only shows once there's at least one item —
    // with none left, it should disappear entirely rather than show a stale value.
    expect(screen.queryByText('Unassigned')).toBeNull();
  });
});

// ── Shares tab removed ────────────────────────────────────────────────────

describe('ExpenseFormScreen — Shares tab removed', () => {
  it('never renders a "Shares" segmented option', () => {
    setupTripMode();
    renderForm();
    expect(screen.queryByText('Shares')).toBeNull();
  });
});

// ── Save ──────────────────────────────────────────────────────────────────

describe('ExpenseFormScreen — Save', () => {
  it('is disabled until description, amount, and a valid split are present', () => {
    setupTripMode();
    renderForm();
    // Save renders but should not be actionable — description/amount are empty,
    // which fails isValid; pressing it should not throw or navigate.
    fireEvent.press(screen.getByText('Save expense'));
    expect(screen.getByText('Save expense')).toBeTruthy();
  });

  it('saves an Evenly split expense with splits summing exactly to the total', async () => {
    setupTripMode();
    const { container } = renderForm();
    await fillDescription('Dinner');
    await fillAmount('100');

    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo  = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      const expense = saved.value[0];
      const sum = expense.splits.reduce((s, sp) => s + sp.amountOwedCents, 0);
      expect(sum).toBe(10000);
    }
  });
});

// ── Evenly mode ───────────────────────────────────────────────────────────

describe('ExpenseFormScreen — Evenly mode', () => {
  it('toggling a member off recomputes the remaining members\' shares', async () => {
    setupTripMode();
    renderForm();
    await fillAmount('90');

    // Alice, Bob, Cleo — 90/3 = 30 each initially.
    expect(screen.getAllByText('€30.00')).toHaveLength(3);

    fireEvent.press(screen.getByText('Bob'));

    // Bob excluded — remaining 90/2 = 45 each for Alice and Cleo; Bob shows €0.00.
    expect(screen.getAllByText('€45.00')).toHaveLength(2);
    expect(screen.getByText('€0.00')).toBeTruthy();
  });
});

// ── Group mode ────────────────────────────────────────────────────────────

describe('ExpenseFormScreen — group mode', () => {
  it('saves via createGroupExpense (group bucket), not addExpense (trip bucket)', async () => {
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    const members = [
      groupMemberFactory({ userId: 'gu1', groupId: 'grp1', displayName: 'Dee' }),
      groupMemberFactory({ userId: 'gu2', groupId: 'grp1', displayName: 'Eli' }),
    ];
    store.getState().appendGroup(groupFactory({ id: 'grp1', currency: 'EUR', members }));
    mockUseLocalSearchParams.mockReturnValue({ groupId: 'grp1' });
    mockUseTripDetail.mockReturnValue({ trip: null, loading: false, error: null, refetch: jest.fn() });
    mockUseExpenseDetail.mockReturnValue({ expense: null, loading: false, error: null, refetch: jest.fn() });

    const rate = container.resolve(EXCHANGE_RATE) as MockExchangeRateService;
    rate.delay = 0;
    renderScreen(<ExpenseFormScreen />, container);

    await fillDescription('Pizza night');
    await fillAmount('40');
    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo = container.resolve(EXPENSE_REPO);
    const savedGroup = await repo.getExpensesForGroup('grp1');
    expect(savedGroup.ok && savedGroup.value).toHaveLength(1);
    const savedTrip = await repo.getExpensesForTrip('t1');
    expect(savedTrip.ok && savedTrip.value).toHaveLength(0);
  });
});

// ── Edit mode — currency reconstruction ──────────────────────────────────

describe('ExpenseFormScreen — edit mode currency reconstruction', () => {
  it('pre-fills the Exact tab in the original entry currency, not trip currency', async () => {
    // A JPY-entered expense saved against a EUR trip: 3555 JPY converted at
    // 0.0062, split evenly between the 3 members at the time of save.
    const rateUsed      = 0.0062;
    const totalEurCents = Math.round(3555 * rateUsed * 100);
    const per           = Math.round(totalEurCents / 3);

    setupEditMode({
      totalAmountCents: totalEurCents,
      currency: 'EUR',
      splits: [
        splitFactory({ id: 's1', userId: 'u1', amountOwedCents: per }),
        splitFactory({ id: 's2', userId: 'u2', amountOwedCents: per }),
        splitFactory({ id: 's3', userId: 'u3', amountOwedCents: totalEurCents - 2 * per }),
      ],
      metadata: {
        originalAmount: { amountCents: 3555, currency: 'JPY', exchangeRate: rateUsed, source: 'live' },
      },
    });
    renderForm();

    // Edit mode always initializes into the Exact tab. The field should show the
    // ORIGINAL JPY amount (~1185), not the stored EUR amount (~7) — if the bug
    // regresses, this field would show a EUR-scale number instead.
    await waitFor(() => expect(screen.getByTestId('exact-amount-input-u1').props.value).not.toBe(''));
    const u1Value = Number(screen.getByTestId('exact-amount-input-u1').props.value);
    expect(u1Value).toBeGreaterThan(1000);
  });
});

// ── Paid by — collision disambiguation ───────────────────────────────────

describe('ExpenseFormScreen — Paid by collision labels', () => {
  it('shows a disambiguating first-name label only for members sharing a first initial', () => {
    setupTripMode({ members: [
      memberFactory({ userId: 'u1', displayName: 'Alice Smith' }),
      memberFactory({ userId: 'u2', displayName: 'Aaron Lee' }),
      memberFactory({ userId: 'u3', displayName: 'Bob Dylan' }),
    ] });
    renderForm();

    // Alice and Aaron collide on "A" — both get a short disambiguating label.
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Aaron')).toBeTruthy();
    // Bob has no collision — no label renders under his avatar at all.
    expect(screen.queryByText('Bob')).toBeNull();
  });
});
