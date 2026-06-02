# Repository Split Design
## TODO_architecture.md — Section 1.1

> Status: **Design only** — no code written yet.
> Next step: implement per Section 1.2.

---

## Problem Statement

`IStorageService` (`src/core/interfaces/IStorageService.ts`) is a 22-method God interface
spanning five unrelated aggregates. Every storage backend must implement all 22 methods
as one unit, making partial mocking, caching layers, and offline queues impossible to add
without touching the entire interface.

---

## Proposed Repository Interfaces

### `ITripRepository`

**DI token:** `TRIP_REPO`
**File:** `src/core/interfaces/ITripRepository.ts`

| Method | Signature |
|--------|-----------|
| `getTrip` | `(id: string) => Promise<Result<Trip, AppError>>` |
| `getTripsForUser` | `(userId: string) => Promise<Result<Trip[], AppError>>` |
| `getTripByInviteToken` | `(token: string) => Promise<Result<Trip, AppError>>` |
| `saveTrip` | `(trip: Trip) => Promise<Result<Trip, AppError>>` |
| `updateTrip` | `(trip: Trip) => Promise<Result<Trip, AppError>>` |
| `deleteTrip` | `(id: string) => Promise<Result<void, AppError>>` |

---

### `IMemberRepository`

**DI token:** `MEMBER_REPO`
**File:** `src/core/interfaces/IMemberRepository.ts`

| Method | Signature |
|--------|-----------|
| `getMembersForTrip` | `(tripId: string) => Promise<Result<TripMember[], AppError>>` |
| `addMember` | `(member: TripMember) => Promise<Result<TripMember, AppError>>` |
| `removeMember` | `(tripId: string, userId: string) => Promise<Result<void, AppError>>` |

---

### `IExpenseRepository`

**DI token:** `EXPENSE_REPO`
**File:** `src/core/interfaces/IExpenseRepository.ts`

| Method | Signature |
|--------|-----------|
| `getExpense` | `(id: string) => Promise<Result<Expense, AppError>>` |
| `getExpensesForTrip` | `(tripId: string) => Promise<Result<Expense[], AppError>>` |
| `saveExpense` | `(expense: Expense) => Promise<Result<Expense, AppError>>` |
| `updateExpense` | `(expense: Expense) => Promise<Result<Expense, AppError>>` |
| `deleteExpense` | `(id: string) => Promise<Result<void, AppError>>` |

---

### `ISplitRepository`

**DI token:** `SPLIT_REPO`
**File:** `src/core/interfaces/ISplitRepository.ts`

| Method | Signature |
|--------|-----------|
| `getSplit` | `(id: string) => Promise<Result<Split, AppError>>` |
| `getSplitsForExpense` | `(expenseId: string) => Promise<Result<Split[], AppError>>` |
| `saveSplit` | `(split: Split) => Promise<Result<Split, AppError>>` |
| `updateSplit` | `(split: Split) => Promise<Result<Split, AppError>>` |
| `deleteSplit` | `(id: string) => Promise<Result<void, AppError>>` |

---

### `ISplitRequestRepository`

**DI token:** `SPLIT_REQUEST_REPO`
**File:** `src/core/interfaces/ISplitRequestRepository.ts`

| Method | Signature |
|--------|-----------|
| `getSplitRequest` | `(id: string) => Promise<Result<SplitRequest, AppError>>` |
| `getSplitRequestsForTrip` | `(tripId: string) => Promise<Result<SplitRequest[], AppError>>` |
| `saveSplitRequest` | `(req: SplitRequest) => Promise<Result<SplitRequest, AppError>>` |
| `updateSplitRequest` | `(req: SplitRequest) => Promise<Result<SplitRequest, AppError>>` |

---

## Consumer → Repository Mapping

Every current caller of `useService(STORAGE)` mapped to the narrower tokens it actually
needs. This table drives the migration in step 1.2.

| Consumer | File | Methods called | Tokens needed |
|----------|------|----------------|---------------|
| `useTrips` | `features/trips/hooks/useTrips.ts` | `getTripsForUser` | `TRIP_REPO` |
| `useCreateTrip` | `features/trips/hooks/useCreateTrip.ts` | `saveTrip` | `TRIP_REPO` |
| `useEditTrip` | `features/trips/hooks/useEditTrip.ts` | `updateTrip` | `TRIP_REPO` |
| `useTripDetail` | `features/trips/hooks/useTripDetail.ts` | `getTrip`, `getExpensesForTrip` | `TRIP_REPO`, `EXPENSE_REPO` |
| `useJoinTrip` | `features/invite/hooks/useJoinTrip.ts` | `getTripByInviteToken`, `getMembersForTrip`, `addMember` | `TRIP_REPO`, `MEMBER_REPO` |
| `useAddExpense` | `features/expenses/hooks/useAddExpense.ts` | `saveExpense`, `saveSplit` | `EXPENSE_REPO`, `SPLIT_REPO` |
| `useEditExpense` | `features/expenses/hooks/useEditExpense.ts` | `updateExpense`, `getSplitsForExpense`, `deleteSplit`, `saveSplit` | `EXPENSE_REPO`, `SPLIT_REPO` |
| `useExpenseDetail` | `features/expenses/hooks/useExpenseDetail.ts` | `getExpense` | `EXPENSE_REPO` |
| `ExpenseDetailScreen` | `features/expenses/screens/ExpenseDetailScreen.tsx` | `getMembersForTrip` | `MEMBER_REPO` |
| `useSettlement` | `features/settlement/hooks/useSettlement.ts` | `getMembersForTrip`, `getExpensesForTrip`, `getSplitRequestsForTrip`, `updateSplit` | `MEMBER_REPO`, `EXPENSE_REPO`, `SPLIT_REQUEST_REPO`, `SPLIT_REPO` |
| `PaymentMethodSheet` | `features/settlement/components/PaymentMethodSheet.tsx` | `saveSplitRequest`, `updateSplitRequest` | `SPLIT_REQUEST_REPO` |
| `BankPaymentScreen` | `features/settlement/screens/BankPaymentScreen.tsx` | `saveSplitRequest`, `updateSplitRequest` | `SPLIT_REQUEST_REPO` |
| `TripSessionStore` | `store/tripSessionStore.ts` | `getTripsForUser`, `getExpensesForTrip`, `getMembersForTrip`, `saveExpense`, `deleteExpense`, `updateSplit` | `TRIP_REPO`, `EXPENSE_REPO`, `MEMBER_REPO`, `SPLIT_REPO` |

---

## New DI Token Definitions

Replace `STORAGE = createToken<IStorageService>('IStorageService')` in `tokens.ts` with:

```typescript
export const TRIP_REPO          = createToken<ITripRepository>('ITripRepository');
export const MEMBER_REPO        = createToken<IMemberRepository>('IMemberRepository');
export const EXPENSE_REPO       = createToken<IExpenseRepository>('IExpenseRepository');
export const SPLIT_REPO         = createToken<ISplitRepository>('ISplitRepository');
export const SPLIT_REQUEST_REPO = createToken<ISplitRequestRepository>('ISplitRequestRepository');
```

> The `STORAGE` token and `IStorageService` interface can be deleted once all consumers
> in the table above are migrated.

---

## Implementation Files to Create / Modify (step 1.2)

### New interface files
- `src/core/interfaces/ITripRepository.ts`
- `src/core/interfaces/IMemberRepository.ts`
- `src/core/interfaces/IExpenseRepository.ts`
- `src/core/interfaces/ISplitRepository.ts`
- `src/core/interfaces/ISplitRequestRepository.ts`

### New / split mock files (from `InMemoryStorageService.ts`)
- `src/__mocks__/InMemoryTripRepository.ts`
- `src/__mocks__/InMemoryMemberRepository.ts`
- `src/__mocks__/InMemoryExpenseRepository.ts`
- `src/__mocks__/InMemorySplitRepository.ts`
- `src/__mocks__/InMemorySplitRequestRepository.ts`

### New / split infrastructure files (from `SupabaseStorageService.ts`)
- `src/infrastructure/supabase/SupabaseTripRepository.ts`
- `src/infrastructure/supabase/SupabaseMemberRepository.ts`
- `src/infrastructure/supabase/SupabaseExpenseRepository.ts`
- `src/infrastructure/supabase/SupabaseSplitRepository.ts`
- `src/infrastructure/supabase/SupabaseSplitRequestRepository.ts`

### Files to modify
- `src/core/di/tokens.ts` — add 5 new tokens, remove `STORAGE`
- `src/core/di/productionContainer.ts` — register 5 Supabase repos, remove STORAGE
- `src/core/di/simulationContainer.ts` — register 5 InMemory repos, remove STORAGE
- `src/core/di/testContainer.ts` — register 5 InMemory repos, update `ContainerOverrides`
- All 13 consumer files in the table above

### Files to delete
- `src/core/interfaces/IStorageService.ts`
- `src/__mocks__/InMemoryStorageService.ts`
- `src/infrastructure/supabase/SupabaseStorageService.ts`

---

## Shared Infrastructure Note

`SupabaseStorageService.ts` currently contains shared row-mapper functions
(`rowToTrip`, `rowToMember`, `rowToExpense`, `rowToSplit`, `rowToSplitRequest`) and the
`toAppError` helper. When splitting:

- Move each `row*` mapper into its corresponding `Supabase*Repository.ts` file.
- Move `toAppError` into a shared `src/infrastructure/supabase/supabaseErrors.ts` utility,
  imported by all five repository files.
- The `supabase` client instance and `Database` type in `supabaseClient.ts` remain shared
  and unchanged.

---

## `StorageFixtures` Replacement (step 1.3)

Currently `InMemoryStorageService` accepts a `StorageFixtures` object with all entity
arrays. After the split, tests will seed per-repository:

```typescript
// Current (monolithic):
const storage = new InMemoryStorageService();
storage.seed({ trips, members, expenses, splits });

// After split (option A — seed each repo independently):
const tripRepo    = new InMemoryTripRepository({ trips });
const memberRepo  = new InMemoryMemberRepository({ members });
const expenseRepo = new InMemoryExpenseRepository({ expenses, splits });
// ...

// After split (option B — keep a seed() helper on each repo constructor):
createTestContainer({
  trips:    new InMemoryTripRepository().seed(trips),
  members:  new InMemoryMemberRepository().seed(members),
  expenses: new InMemoryExpenseRepository().seed(expenses, splits),
});
```

Option B keeps test file verbosity low and mirrors the current pattern. Recommended.

---

## Risk Notes

1. **`TripSessionStore` has the widest fan-out** — it uses 4 repositories. The
   `createTripSessionStore(storage)` factory signature will become
   `createTripSessionStore(trips, expenses, members, splits)`. All three container
   factories must be updated.

2. **`useSettlement` uses 4 repositories** — it will resolve 4 tokens instead of 1.
   This is fine (each is narrowly typed) but is the most lines changed in a single hook.

3. **`InMemoryMemberRepository` storage shape** — the current `InMemoryStorageService`
   stores members as `Map<tripId, TripMember[]>` rather than `Map<memberId, TripMember>`.
   This inconsistency should be fixed in the new class: use `Map<string, TripMember[]>`
   keyed by `tripId` (same behaviour) but document it explicitly, or normalise to a flat
   map with a `tripId` index.

4. **Test file impact** — every test file that calls `createTestContainer()` with a
   `storage` override must be updated to use the new per-repo overrides. The
   `ContainerOverrides` type change is the forcing function.
