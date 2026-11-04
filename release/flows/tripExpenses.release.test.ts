import { waitFor } from '@testing-library/react-native';
import { useCreateTrip } from '../../src/features/trips/hooks/useCreateTrip';
import { useAddExpense } from '../../src/features/expenses/hooks/useAddExpense';
import { EXPENSE_REPO, MEMBER_REPO, TRIP_REPO, TRIP_STORE } from '../../src/core/di/tokens';
import { generateId } from '../../src/core/utils/generateId';
import type { Expense } from '../../src/core/models/Expense';
import type { Trip } from '../../src/core/models/Trip';
import { admin, closeClient, container, createUser, renderAppHook, run, signInAs, TestUser } from '../support';

async function splitsInDb(expenseId: string) {
  const { data } = await admin.from('splits').select('user_id, amount_owed_cents').eq('expense_id', expenseId);
  return (data ?? []).sort((a, b) => a.user_id.localeCompare(b.user_id));
}

async function loadTripIntoStore(tripId: string): Promise<Expense[]> {
  const store = (await container()).resolve(TRIP_STORE);
  await store.getState().loadTripDetail(tripId);
  return store.getState().expenses[tripId] ?? [];
}

describe('trip expenses', () => {
  let owner: TestUser;
  let payer: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let trip: Trip;
  let expense: Expense;

  beforeAll(async () => {
    outsider = await createUser('Outsider');
    member = await createUser('Member');
    payer = await createUser('Payer');
    owner = await createUser('Owner');
  });

  afterAll(closeClient);

  it('owner creates a trip with an invite token', async () => {
    const { result } = await renderAppHook(() => useCreateTrip());
    trip = (await run(() => result.current.createTrip('Lisbon', 'EUR')))!;
    expect(result.current.error).toBeNull();
    expect(trip.inviteToken).toBeTruthy();
  });

  it('owner adds two members', async () => {
    const members = (await container()).resolve(MEMBER_REPO);
    for (const u of [payer, member]) {
      const added = await members.addMember({
        userId: u.id, tripId: trip.id, displayName: u.name, isGuest: false, joinedAt: new Date(),
      });
      expect(added.ok).toBe(true);
    }

    const { data } = await admin.from('trip_members').select('user_id').eq('trip_id', trip.id);
    expect(data!.map(r => r.user_id).sort()).toEqual([owner.id, payer.id, member.id].sort());
  });

  it('a member adds an expense split three ways', async () => {
    await signInAs(payer);
    const { result } = await renderAppHook(() => useAddExpense(trip.id));
    expense = (await run(() => result.current.addExpense({
      description: 'Dinner', totalAmountCents: 9000, currency: 'EUR', paidByUserId: payer.id,
      splits: [owner, payer, member].map(u => ({ userId: u.id, amountOwedCents: 3000 })),
    })))!;
    expect(result.current.error).toBeNull();
    expect(await splitsInDb(expense.id)).toHaveLength(3);
  });

  it('every member sees the expense', async () => {
    await signInAs(owner);
    const result = await (await container()).resolve(EXPENSE_REPO).getExpensesForTrip(trip.id);
    expect(result.ok && result.value.map(e => e.description)).toEqual(['Dinner']);
  });

  it('a member who is neither payer nor owner cannot edit it', async () => {
    await signInAs(member);
    const [existing] = await loadTripIntoStore(trip.id);
    const store = (await container()).resolve(TRIP_STORE);

    const saved = await store.getState().editExpense(existing, { ...existing, description: 'Hijacked' });

    expect(saved).toBe(false);
    const { data } = await admin.from('expenses').select('description').eq('id', expense.id).single();
    expect(data!.description).toBe('Dinner');
  });

  it('the payer can edit the amount and splits', async () => {
    await signInAs(payer);
    const [existing] = await loadTripIntoStore(trip.id);
    const store = (await container()).resolve(TRIP_STORE);

    const saved = await store.getState().editExpense(existing, {
      ...existing,
      totalAmountCents: 6000,
      splits: [payer, member].map(u => ({
        id: generateId(), expenseId: existing.id, userId: u.id, amountOwedCents: 3000, amountPaidCents: 0,
      })),
    });

    expect(saved).toBe(true);
    expect(await splitsInDb(expense.id)).toEqual(
      [payer, member].map(u => ({ user_id: u.id, amount_owed_cents: 3000 })).sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );
  });

  // KNOWN BUG (pending decision, docs/release-tests-todo.md): the UPDATE policy has
  // no WITH CHECK, so Postgres applies "paid_by_user_id = auth.uid()" to the new
  // row too and refuses a payer change by the payer.
  it.failing('the payer can hand the expense to someone else without leaving stale splits', async () => {
    await signInAs(payer);
    const [existing] = await loadTripIntoStore(trip.id);
    const store = (await container()).resolve(TRIP_STORE);

    const saved = await store.getState().editExpense(existing, {
      ...existing,
      paidByUserId: member.id,
      splits: [owner, member].map(u => ({
        id: generateId(), expenseId: existing.id, userId: u.id, amountOwedCents: 3000, amountPaidCents: 0,
      })),
    });

    expect(saved).toBe(true);
    expect(await splitsInDb(expense.id)).toEqual(
      [owner, member].map(u => ({ user_id: u.id, amount_owed_cents: 3000 })).sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );
  });

  it('a non-member cannot read the trip or its expenses', async () => {
    await signInAs(outsider);
    const c = await container();
    expect((await c.resolve(TRIP_REPO).getTrip(trip.id)).ok).toBe(false);
    const expenses = await c.resolve(EXPENSE_REPO).getExpensesForTrip(trip.id);
    expect(expenses.ok && expenses.value).toEqual([]);
  });

  it('the trip owner can delete the expense, and its splits go with it', async () => {
    await signInAs(owner);
    await loadTripIntoStore(trip.id);
    const store = (await container()).resolve(TRIP_STORE);

    expect(await store.getState().removeExpense(expense.id, trip.id)).toBe(true);

    const { data } = await admin.from('expenses').select('id').eq('id', expense.id);
    expect(data).toEqual([]);
    expect(await splitsInDb(expense.id)).toEqual([]);
  });

  // KNOWN BUG (docs/release-tests-todo.md): activity_events.expense_id is
  // ON DELETE CASCADE, so deleting an expense erases its history, and the
  // 'expense.deleted' event (logged fire-and-forget) fails its foreign key.
  it.failing('the deletion shows up in the trip history', async () => {
    await waitFor(async () => {
      const { data } = await admin.from('activity_events').select('event_type').eq('trip_id', trip.id);
      expect(data!.map(e => e.event_type)).toEqual(
        expect.arrayContaining(['expense.created', 'expense.updated', 'expense.deleted']),
      );
    }, { timeout: 3000 });
  });
});
