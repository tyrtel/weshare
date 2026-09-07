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
import { useLocalSearchParams, useRouter } from 'expo-router';
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

async function setupGroupEditMode(container: ServiceContainer, expenseOverrides: Parameters<typeof expenseFactory>[0] = {}) {
  const members = [
    groupMemberFactory({ userId: 'gu1', groupId: 'grp1', displayName: 'Dee' }),
    groupMemberFactory({ userId: 'gu2', groupId: 'grp1', displayName: 'Eli' }),
  ];
  const group = groupFactory({ id: 'grp1', currency: 'EUR', members });
  const store = container.resolve(TRIP_STORE);
  store.getState().appendGroup(group);

  const expense = expenseFactory({ id: 'e1', tripId: undefined, groupId: 'grp1', ...expenseOverrides });
  await container.resolve(EXPENSE_REPO).saveExpense(expense);
  store.getState().appendGroupExpense(expense);

  // The edit route passes id + groupId — no tripId, matching the real
  // navigation wired up from GroupExpenseDetailScreen's edit button.
  mockUseLocalSearchParams.mockReturnValue({ id: 'e1', groupId: 'grp1' });
  mockUseTripDetail.mockReturnValue({ trip: null, loading: false, error: null, refetch: jest.fn() });
  mockUseExpenseDetail.mockReturnValue({ expense, loading: false, error: null, refetch: jest.fn() });

  return { group, members, expense };
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

// Add mode only: step 1 (details) -> step 2 (split). Assumes description +
// amount/items are already filled in, so the Continue button is enabled.
async function goToSplitStep() {
  fireEvent.press(screen.getByTestId('expense-continue-button'));
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
    await goToSplitStep();

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
    await goToSplitStep();

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
    await goToSplitStep();

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
    await goToSplitStep();

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
    await goToSplitStep();
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
    await goToSplitStep();
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
    await goToSplitStep();
    fireEvent.press(screen.getByText('Exact'));

    fireEvent.changeText(screen.getByTestId('exact-amount-input-u1'), '10');
    expect(screen.getByText('€20.00')).toBeTruthy();
  });

  it('"Unassigned" goes negative when entered amounts exceed the total', async () => {
    renderForm();
    await fillDescription('Groceries');
    await fillAmount('30');
    await goToSplitStep();
    fireEvent.press(screen.getByText('Exact'));

    fireEvent.changeText(screen.getByTestId('exact-amount-input-u1'), '25');
    fireEvent.changeText(screen.getByTestId('exact-amount-input-u2'), '25');
    expect(screen.getByText('-€20.00')).toBeTruthy();
  });
});

// ── Itemized mode ─────────────────────────────────────────────────────────
// Step 1 (add mode) only: item entry itself. Assigning items to members is a
// step-2 concern now — see "Two-step flow (add mode)" below.

describe('ExpenseFormScreen — Itemized mode', () => {
  beforeEach(() => setupTripMode());

  it('item description and amount fields are editable', async () => {
    renderForm();
    await fillDescription('Receipt');
    fireEvent.press(screen.getByTestId('expense-itemize-toggle'));
    fireEvent.press(screen.getByText('Add item'));

    const itemField = screen.getByTestId(/^item-description-input-/);
    fireEvent.changeText(itemField, 'Bread');
    expect(itemField.props.value).toBe('Bread');
  });

  it('item amount field does not lose focus mid-keystroke', async () => {
    renderForm();
    await fillDescription('Receipt');
    fireEvent.press(screen.getByTestId('expense-itemize-toggle'));
    fireEvent.press(screen.getByText('Add item'));

    const itemAmount = screen.getByTestId(/^item-amount-input-/);
    fireEvent.changeText(itemAmount, '4');
    expect(itemAmount.props.value).toBe('4');
    fireEvent.changeText(itemAmount, '4.5');
    expect(itemAmount.props.value).toBe('4.5');
  });

  it('the running total (shown where the amount field was) updates live as items are added', async () => {
    renderForm();
    await fillDescription('Receipt');
    fireEvent.press(screen.getByTestId('expense-itemize-toggle'));
    fireEvent.press(screen.getByText('Add item'));

    fireEvent.changeText(screen.getByTestId(/^item-amount-input-/), '20');
    expect(screen.getByTestId('expense-itemized-total')).toHaveTextContent('€20.00');
  });

  it('removing an item drops it and recomputes the running total', async () => {
    renderForm();
    await fillDescription('Receipt');
    fireEvent.press(screen.getByTestId('expense-itemize-toggle'));
    fireEvent.press(screen.getByText('Add item'));
    fireEvent.press(screen.getByText('Add item'));

    const amounts = screen.getAllByTestId(/^item-amount-input-/);
    fireEvent.changeText(amounts[0], '20');
    fireEvent.changeText(amounts[1], '15');
    expect(screen.getByTestId('expense-itemized-total')).toHaveTextContent('€35.00');

    fireEvent.press(screen.getAllByTestId(/^item-remove-button-/)[1]);

    expect(screen.getAllByTestId(/^item-amount-input-/)).toHaveLength(1);
    expect(screen.getByTestId('expense-itemized-total')).toHaveTextContent('€20.00');
  });

  it('"Break into items" swaps back to a single amount field, and back again', async () => {
    renderForm();
    await fillAmount('12');
    expect(screen.getByTestId('expense-amount-input')).toBeTruthy();

    fireEvent.press(screen.getByTestId('expense-itemize-toggle'));
    expect(screen.queryByTestId('expense-amount-input')).toBeNull();
    expect(screen.getByTestId('expense-itemized-total')).toBeTruthy();

    fireEvent.press(screen.getByTestId('expense-itemize-toggle'));
    expect(screen.getByTestId('expense-amount-input')).toBeTruthy();
    expect(screen.queryByTestId('expense-itemized-total')).toBeNull();
  });
});

// ── Two-step flow (add mode) ─────────────────────────────────────────────

describe('ExpenseFormScreen — Two-step flow (add mode)', () => {
  beforeEach(() => setupTripMode());

  it('Continue is disabled until description and a positive amount are present', () => {
    renderForm();
    const continueBtn = screen.getByTestId('expense-continue-button');
    expect(continueBtn).toBeDisabled();

    fireEvent.press(continueBtn);
    // A disabled press should not advance — step 1 fields are still there.
    expect(screen.getByTestId('expense-amount-input')).toBeTruthy();
    expect(screen.queryByTestId('payer-select-u1')).toBeNull();
  });

  it('items entered on step 1 carry into step 2 pre-assigned to everyone, and "Itemized" only appears when items exist', async () => {
    renderForm();
    await fillDescription('Receipt');
    fireEvent.press(screen.getByTestId('expense-itemize-toggle'));
    fireEvent.press(screen.getByText('Add item'));
    fireEvent.changeText(screen.getByTestId(/^item-description-input-/), 'Bread');
    fireEvent.changeText(screen.getByTestId(/^item-amount-input-/), '20');
    await goToSplitStep();

    // Itemized is available and already showing (pre-selected from step 1),
    // with the item assigned to every member by default.
    expect(screen.getByText('Items')).toBeTruthy();
    expect(screen.getByText('Bread')).toBeTruthy();
    expect(screen.getAllByTestId(/^item-member-toggle-/)).toHaveLength(DEFAULT_MEMBERS.length);
  });

  it('"Itemized" is not offered in step 2 when no items were entered', async () => {
    renderForm();
    await fillDescription('Dinner');
    await fillAmount('30');
    await goToSplitStep();
    expect(screen.queryByText('Items')).toBeNull();
  });

  it('back-chevron from step 2 returns to step 1 without losing entered data', async () => {
    renderForm();
    await fillDescription('Dinner');
    await fillAmount('30');
    await goToSplitStep();

    fireEvent.press(screen.getByTestId('expense-back-button'));

    expect(screen.getByTestId('expense-description-input').props.value).toBe('Dinner');
    expect(screen.getByTestId('expense-amount-input').props.value).toBe('30');
  });

  it('tapping the step-2 summary header also returns to step 1', async () => {
    renderForm();
    await fillDescription('Dinner');
    await fillAmount('30');
    await goToSplitStep();

    fireEvent.press(screen.getByTestId('expense-summary-header'));

    expect(screen.getByTestId('expense-amount-input')).toBeTruthy();
  });

  it('editing the amount on step 1, then continuing again, updates the split results on step 2', async () => {
    renderForm();
    await fillDescription('Dinner');
    await fillAmount('90');
    await goToSplitStep();
    expect(screen.getAllByText('€30.00')).toHaveLength(3); // 90 / 3 members

    fireEvent.press(screen.getByTestId('expense-back-button'));
    await fillAmount('60');
    await goToSplitStep();
    expect(screen.getAllByText('€20.00')).toHaveLength(3); // 60 / 3 members
  });

  it('paid-by and split-method selections survive a trip back to step 1 and forward again', async () => {
    renderForm();
    await fillDescription('Dinner');
    await fillAmount('30');
    await goToSplitStep();

    fireEvent.press(screen.getByTestId('payer-select-u2'));
    fireEvent.press(screen.getByText('Exact'));

    fireEvent.press(screen.getByTestId('expense-back-button'));
    await goToSplitStep();

    expect(screen.getByTestId('payer-select-u2').props.accessibilityState.selected).toBe(true);
    // Still on the Exact tab — its per-member inputs render without re-selecting it.
    expect(screen.getByTestId('exact-amount-input-u1')).toBeTruthy();
  });
});

// ── Shares tab removed ────────────────────────────────────────────────────

describe('ExpenseFormScreen — Shares tab removed', () => {
  it('never renders a "Shares" segmented option', async () => {
    setupTripMode();
    renderForm();
    await fillDescription('Dinner');
    await fillAmount('30');
    await goToSplitStep();
    expect(screen.queryByText('Shares')).toBeNull();
  });
});

// ── Save ──────────────────────────────────────────────────────────────────

describe('ExpenseFormScreen — Save', () => {
  it('saves an Evenly split expense with splits summing exactly to the total', async () => {
    setupTripMode();
    const { container } = renderForm();
    await fillDescription('Dinner');
    await fillAmount('100');
    await goToSplitStep();

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

  // Regression coverage for a reported bug: on device, "Save expense" would
  // seemingly save but never navigate away, so pressing it again created a
  // duplicate. Every other Save test up to now only checked the repo state —
  // none of them ever asserted the screen actually navigates back afterward.
  it('navigates back exactly once after a successful save', async () => {
    setupTripMode();
    renderForm();
    const router = useRouter();
    // The router mock is a single object shared across every test in this
    // file (see mockExpoRouterModule's own doc comment) — clear it so an
    // earlier test's save doesn't inflate this count.
    (router.back as jest.Mock).mockClear();
    (router.replace as jest.Mock).mockClear();
    await fillDescription('Dinner');
    await fillAmount('100');
    await goToSplitStep();

    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not create a duplicate expense when Save is tapped twice in quick succession', async () => {
    setupTripMode();
    const { container } = renderForm();
    await fillDescription('Dinner');
    await fillAmount('100');
    await goToSplitStep();

    const saveButton = screen.getByText('Save expense');
    fireEvent.press(saveButton);
    fireEvent.press(saveButton); // a second tap landing before the first save settles

    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo  = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok && saved.value).toHaveLength(1);
  });

  // Regression coverage for a reported bug: pick someone other than the
  // default first member as payer, save, then check what actually landed in
  // the repo — not just what the still-mounted form believes.
  it('persists the explicitly selected payer, not the default first member', async () => {
    setupTripMode(); // members: Alice (u1, default), Bob (u2), Cleo (u3)
    const { container } = renderForm();
    await fillDescription('Dinner');
    await fillAmount('100');
    await goToSplitStep();

    fireEvent.press(screen.getByTestId('payer-select-u2')); // Bob
    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo  = container.resolve(EXPENSE_REPO);
    const saved = await repo.getExpensesForTrip('t1');
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value[0].paidByUserId).toBe('u2');
  });
});

// ── Evenly mode ───────────────────────────────────────────────────────────

describe('ExpenseFormScreen — Evenly mode', () => {
  it('toggling a member off recomputes the remaining members\' shares', async () => {
    setupTripMode();
    renderForm();
    await fillDescription('Party');
    await fillAmount('90');
    await goToSplitStep();

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
    await goToSplitStep();
    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo = container.resolve(EXPENSE_REPO);
    const savedGroup = await repo.getExpensesForGroup('grp1');
    expect(savedGroup.ok && savedGroup.value).toHaveLength(1);
    const savedTrip = await repo.getExpensesForTrip('t1');
    expect(savedTrip.ok && savedTrip.value).toHaveLength(0);
  });
});

// ── Group mode — edit (regression: group expenses had no edit route) ────

describe('ExpenseFormScreen — group mode edit', () => {
  it('loads without hanging on trip data and pre-fills the existing values', async () => {
    const container = createTestContainer();
    await setupGroupEditMode(container, { description: 'Groceries', totalAmountCents: 4500 });

    const rate = container.resolve(EXCHANGE_RATE) as MockExchangeRateService;
    rate.delay = 0;
    renderScreen(<ExpenseFormScreen />, container);

    await waitFor(() => expect(screen.getByTestId('expense-description-input').props.value).toBe('Groceries'));
    expect(screen.queryByText('Save expense')).toBeTruthy();
  });

  it('saves via editExpense — updates the existing group expense rather than creating a second one', async () => {
    const container = createTestContainer();
    const { expense } = await setupGroupEditMode(container, {
      description: 'Groceries',
      totalAmountCents: 4500,
      splits: [splitFactory({ id: 's1', userId: 'gu1', amountOwedCents: 4500 })],
    });

    const rate = container.resolve(EXCHANGE_RATE) as MockExchangeRateService;
    rate.delay = 0;
    renderScreen(<ExpenseFormScreen />, container);

    await waitFor(() => expect(screen.getByTestId('expense-description-input').props.value).toBe('Groceries'));
    await fillDescription('Groceries (updated)');
    fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(screen.queryByText('Save expense')).toBeNull());

    const repo = container.resolve(EXPENSE_REPO);
    const savedGroup = await repo.getExpensesForGroup('grp1');
    expect(savedGroup.ok && savedGroup.value).toHaveLength(1);
    expect(savedGroup.ok && savedGroup.value[0].id).toBe(expense.id);
    expect(savedGroup.ok && savedGroup.value[0].description).toBe('Groceries (updated)');

    // The store cache reflects the update too (replaceExpense routing).
    const cached = container.resolve(TRIP_STORE).getState().groupExpenses['grp1'];
    expect(cached).toHaveLength(1);
    expect(cached?.[0].description).toBe('Groceries (updated)');
  });

  it('restores itemized mode and its items for a group expense, same as a trip expense', async () => {
    const container = createTestContainer();
    await setupGroupEditMode(container, {
      totalAmountCents: 5000,
      splits: [splitFactory({ id: 's1', userId: 'gu1', amountOwedCents: 5000 })],
      metadata: {
        lineItems: [{ id: 'li1', description: 'Snacks', amountCents: 5000, assignedUserIds: ['gu1'] }],
      },
    });

    const rate = container.resolve(EXCHANGE_RATE) as MockExchangeRateService;
    rate.delay = 0;
    renderScreen(<ExpenseFormScreen />, container);

    await waitFor(() => expect(screen.getByTestId('item-description-input-li1')).toBeTruthy());
    expect(screen.getByTestId('item-description-input-li1').props.value).toBe('Snacks');
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

// ── Edit mode — itemized restoration (regression) ────────────────────────
// Previously, editing an itemized expense always re-opened in the "Exact"
// tab with no items — initialMode was hardcoded to 'custom' and
// initialLineItems was never passed to useSplitForm at all.

describe('ExpenseFormScreen — edit mode itemized restoration', () => {
  it('re-opens directly on the Items tab with every saved item pre-filled', async () => {
    setupEditMode({
      totalAmountCents: 5000,
      currency: 'EUR',
      splits: [
        splitFactory({ id: 's1', userId: 'u1', amountOwedCents: 3000 }),
        splitFactory({ id: 's2', userId: 'u2', amountOwedCents: 2000 }),
      ],
      metadata: {
        lineItems: [
          { id: 'li1', description: 'Pizza',  amountCents: 3000, assignedUserIds: ['u1', 'u2'] },
          { id: 'li2', description: 'Drinks', amountCents: 2000, assignedUserIds: ['u1'] },
        ],
      },
    });
    renderForm();

    // No tap on "Items" needed — it should already be the active tab.
    await waitFor(() => expect(screen.getByTestId('item-description-input-li1')).toBeTruthy());
    expect(screen.getByTestId('item-description-input-li1').props.value).toBe('Pizza');
    expect(screen.getByTestId('item-amount-input-li1').props.value).toBe('30.00');
    expect(screen.getByTestId('item-description-input-li2').props.value).toBe('Drinks');
    expect(screen.getByTestId('item-amount-input-li2').props.value).toBe('20.00');
  });

  it('still opens on the Exact tab for a non-itemized expense (no regression)', async () => {
    setupEditMode({
      totalAmountCents: 5000,
      splits: [splitFactory({ id: 's1', userId: 'u1', amountOwedCents: 5000 })],
    });
    renderForm();

    await waitFor(() => expect(screen.getByTestId('exact-amount-input-u1')).toBeTruthy());
    expect(screen.queryByTestId(/^item-description-input-/)).toBeNull();
  });

  it('reconstructs item amounts in the original entry currency, not trip currency', async () => {
    // Mirrors the "edit mode currency reconstruction" case above, but for an
    // itemized expense: a JPY-entered receipt saved against a EUR trip.
    const rateUsed = 0.0062;
    const totalEurCents = Math.round(2000 * rateUsed * 100); // ¥2000 -> EUR cents
    setupEditMode({
      totalAmountCents: totalEurCents,
      currency: 'EUR',
      splits: [splitFactory({ id: 's1', userId: 'u1', amountOwedCents: totalEurCents })],
      metadata: {
        lineItems: [{ id: 'li1', description: 'Ramen', amountCents: totalEurCents, assignedUserIds: ['u1'] }],
        originalAmount: { amountCents: 2000, currency: 'JPY', exchangeRate: rateUsed, source: 'live' },
      },
    });
    renderForm();

    await waitFor(() => expect(screen.getByTestId('item-amount-input-li1').props.value).not.toBe(''));
    const shownValue = Number(screen.getByTestId('item-amount-input-li1').props.value);
    expect(shownValue).toBeGreaterThan(1000); // ~2000 JPY, not the ~12-cent EUR figure
  });
});

// ── Receipt scan — regression: ReceiptCapture was built but never mounted ──

describe('ExpenseFormScreen — Receipt scan', () => {
  it('renders the scan-receipt button in add mode', () => {
    setupTripMode();
    renderForm();
    expect(screen.getByLabelText('Scan receipt')).toBeTruthy();
  });

  it('renders the scan-receipt button in edit mode', () => {
    setupEditMode();
    renderForm();
    expect(screen.getByLabelText('Scan receipt')).toBeTruthy();
  });

  it('renders the scan-receipt button in group mode', () => {
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    store.getState().appendGroup(groupFactory({
      id: 'grp1', currency: 'EUR',
      members: [groupMemberFactory({ userId: 'gu1', groupId: 'grp1', displayName: 'Dee' })],
    }));
    mockUseLocalSearchParams.mockReturnValue({ groupId: 'grp1' });
    mockUseTripDetail.mockReturnValue({ trip: null, loading: false, error: null, refetch: jest.fn() });
    mockUseExpenseDetail.mockReturnValue({ expense: null, loading: false, error: null, refetch: jest.fn() });
    renderForm(container);
    expect(screen.getByLabelText('Scan receipt')).toBeTruthy();
  });
});

describe('ExpenseFormScreen — Paid by collision labels', () => {
  it('shows a disambiguating first-name label only for members sharing a first initial', async () => {
    setupTripMode({ members: [
      memberFactory({ userId: 'u1', displayName: 'Alice Smith' }),
      memberFactory({ userId: 'u2', displayName: 'Aaron Lee' }),
      memberFactory({ userId: 'u3', displayName: 'Bob Dylan' }),
    ] });
    renderForm();
    await fillDescription('Dinner');
    await fillAmount('30');
    await goToSplitStep();

    // Alice and Aaron collide on "A" — both get a short disambiguating label.
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Aaron')).toBeTruthy();
    // Bob has no collision — no label renders under his avatar at all.
    expect(screen.queryByText('Bob')).toBeNull();
  });
});
