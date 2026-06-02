# Settle Screen — Implementation Plan

Track progress by changing `[ ]` to `[x]` as each item is completed.
Phases are sequential. Do not start a phase until the previous one has all tests passing.

---

## Phase 1 — Trip State Machine ✅ DONE (2026-05-27, 622/622 tests)

**Goal:** trips have a `status` field (`active | settling | closed`).
Settling locks new expenses. Closing hides the trip from the active list.

### 1.1 — Model & schema

- [x] Add `status: 'active' | 'settling' | 'closed'` to `src/core/models/Trip.ts`
- [x] Default to `'active'` everywhere a `Trip` is constructed (fixtures, factories, tests)
- [x] Add migration `011_trip_status.sql` — `ALTER TABLE trips ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`; add a CHECK constraint on the three values
- [x] Update `src/infrastructure/supabase/rowSchemas.ts` — add `status` to the trip row Zod schema
- [x] Update `SupabaseTripRepository` (`getTrip`, `getTripsForUser`, `saveTrip`, `updateTrip`) to read/write `status`
- [x] Update `InMemoryTripRepository` to persist `status` through seed and update calls
- [x] Update `restaurantScenario` and `twoPersonScenario` fixtures — set `status: 'active'` explicitly

### 1.2 — Repository & store

- [x] Add `setTripStatus(tripId, status)` to `ITripRepository` interface
- [x] Implement in `SupabaseTripRepository` (single-column UPDATE)
- [x] Implement in `InMemoryTripRepository`
- [x] Add `setTripStatus(tripId, status)` action to `tripSessionStore` (mutates the store and calls the repo)
- [x] Update `ITripSessionStore` interface to declare the new action

### 1.3 — Expense-add guard

- [x] In `tripSessionStore.addExpense`, read `trip.status` from the store cache via `get()`
- [x] If `status !== 'active'`, set `hydrationError` — "Expenses cannot be added while the trip is being settled"
- [x] Tests: `settling`/`closed` trip rejects `addExpense`; `active` accepts; unknown trip bypasses guard

### 1.4 — "Begin Settling" trigger

- [x] Replace static "Settle up" button in `TripDetailScreen` with a status-aware version:
  - `active` + expenses: "Settle Up" — confirmation Alert, `setTripStatus('settling')`, navigate
  - `settling`: "Settling in progress" — navigates directly, no status change
  - `closed`: button hidden
- [x] `SettlementScreen` settling banner: "Expenses locked while settling" (when `tripStatus === 'settling'`)
- [x] "Reopen trip" link in banner — only shown when no `completed` SplitRequests exist
  - On press: confirmation Alert, `setTripStatus(tripId, 'active')`
- [x] `useSettlement` hook exposes `tripStatus` and `reopenTrip`

### 1.5 — Tests for Phase 1

- [x] `tripSessionStore` — `setTripStatus` updates store + repo; non-existent trip returns error
- [x] `tripSessionStore` — `addExpense` blocked when `settling`/`closed`; allowed when `active` or trip unknown
- [x] `TripDetailScreen` — "Settle Up" when active+expenses; "Settling in progress" when settling; hidden when closed/no expenses
- [x] `SettlementScreen` — banner shown when `settling`; "Reopen trip" shown/hidden based on completed requests

---

## Phase 2 — Debt Status: Manual Toggle ✅ DONE (2026-05-27, 135/135 settlement tests)

**Goal:** any trip participant can mark a debt as `paid` or revert it to `owed`.
No payment flow required — this is the "I Venmoed you already" use case.

### 2.1 — Model changes

- [x] Add `'owed'` and `'paid'` to `SplitRequestStatus` union in `src/core/models/SplitRequest.ts`
  - `owed` — new default for manually-tracked debts (replaces `created` for the non-payment-flow path)
  - `paid` — manually confirmed by any participant; can be reverted
  - Keep all existing payment-flow statuses (`created`, `request_sent`, `authorized`, `pending`, `completed`, `declined`, `expired`) unchanged
- [x] Update `SplitStatusBadge` (`src/components/ui/SplitStatusBadge.tsx`) to render `owed`, `paid`, and `authorized` with appropriate colours

### 2.2 — `useSettlement` hook changes

- [x] Add `markDebtPaid(fromUserId, toUserId)` — creates or updates a SplitRequest to `status: 'paid'`
  - Any participant can call this (not just the debtor)
  - If a SplitRequest already exists for this pair, update it; otherwise create a new one
- [x] Add `markDebtOwed(fromUserId, toUserId)` — reverts a `paid` SplitRequest back to `owed`
  - Guard: only allowed if status is `paid` (not in `PAYMENT_FLOW_STATUSES`)
- [x] Expose both actions from the hook return value

### 2.3 — `SettlementRow` UI

- [x] Replace the current single "Settle" button with context-sensitive actions:
  - When debt has no request or `status === 'owed'`: "Mark Paid" button (any participant) + "Pay" button (debtor only)
  - When `status === 'paid'` (manual): "Undo" link in action column; badge hidden
  - When payment-flow status: existing `SplitStatusBadge` + chevron to history
- [ ] Swipe-to-mark-paid gesture (optional, nice to have — do after core toggle works)

### 2.4 — Tests for Phase 2

- [x] `markDebtPaid` creates a new SplitRequest with `status: 'paid'` when none exists
- [x] `markDebtPaid` updates an existing `owed` SplitRequest to `paid`
- [x] `markDebtOwed` reverts `paid` -> `owed`
- [x] `markDebtOwed` does nothing when status is in payment flow (`pending`)
- [x] `markDebtOwed` does nothing when no request exists
- [x] `makeTrip()` in test fixtures now includes `status: 'active' as const`
- [x] `SettlementScreen` IDLE_STATE updated: `markDebtPaid`/`markDebtOwed` added, `settling` removed

---

## Phase 3 — Payment Flow Integration ✅ DONE (2026-05-27, 177/177 tests)

**Goal:** wire Stripe, Open Banking, and deep-link wallets into the debt toggle flow.
Payment-flow completions auto-mark the debt `completed`; webhooks are the source of truth.

### 3.1 — Payment sheet wiring

- [x] `PaymentMethodSheet` — confirmed it passes all required fields to payment methods
- [x] `appendSplitRequest(req)` added to `ITripSessionStore` (cache-only, no repo call)
- [x] `SettlementScreen.onPaymentLaunched` calls `appendSplitRequest` so the request lands in Zustand immediately
- [x] `SettlementRow` shows `ActivityIndicator` spinner while `status === 'pending'` or `'authorized'`

### 3.2 — Stripe flow

- [x] `create-payment-link` Edge Function already returns a Stripe Checkout URL
- [x] `stripe-webhook` Edge Function already handles `checkout.session.completed` -> `completed`
- [x] `useStatusPoller` wired inside `useSettlement` — polls `stripeService.getPaymentStatus` for any settlement with a Stripe request in a non-terminal state; propagates changes via `updateRequestStatus`

### 3.3 — Open Banking / Tink flow

- [x] `ob-initiate` -> `authorized`, `ob-webhook` -> `completed` (Edge Functions already implemented)
- [x] `BankPaymentScreen` confirmed: handles in-screen polling and navigates back on terminal status
- [x] `SettlementScreen` uses `useFocusEffect` to `refetch()` split requests when screen regains focus (covers OB return path)

### 3.4 — Deep-link wallets (PayPal, Venmo, etc.)

- [x] AppState foreground-return dialog sets `pending` on "Yes, I paid" — works now that `appendSplitRequest` puts the request in the store first
- [x] `pending` -> `completed` is manual via "Mark Paid" (creditor confirms)

### 3.5 — Tests for Phase 3

- [x] `appendSplitRequest` store tests (3 scenarios: empty bucket, existing bucket, no repo side-effect)
- [x] After `appendSplitRequest`, settlement row shows new request with correct status
- [x] Deep-link: `updateRequestStatus(req, 'pending')` sets `pending` after foreground-return
- [x] Stripe poller: propagates `completed` status to the row via `MockStripeService`

---

## Phase 4 — Debt Rollover into Another Trip ✅ DONE (2026-05-27, 676/676 tests)

**Goal:** carry unpaid debts from one trip into another (existing or new), matching participants by contact identity (email / phone).

### 4.1 — Participant identity

- [x] `TripMember` already has `email` and `phone` fields (added in migration 005)
- [x] Add a pure utility `matchParticipants(sourceMembers, targetMembers): Map<string, string>` in `src/core/logic/participantMatcher.ts`
  - Matches by email first, then phone; returns `sourceUserId -> targetUserId`
  - Unmatched source members are returned as `unmatched: TripMember[]`
- [x] Write unit tests for `matchParticipants` covering: exact match, partial overlap, no overlap, email+phone conflict

### 4.2 — Rollover logic

- [x] Add pure function `computeRolloverDebts(settlements, matchMap): RolloverDebt[]` in `src/core/logic/rollover.ts`
  - Takes only `owed` / `created` SplitRequests (skips `paid`, `completed`)
  - Remaps `payerUserId` / `requesterUserId` through `matchMap`
  - Returns new SplitRequest seeds with `rolledOverFromTripId` set
- [x] Add `rolledOverFromTripId: string | null` to the `SplitRequest` model
- [x] Add migration `012_split_request_rollover.sql` — `ALTER TABLE split_requests ADD COLUMN rolled_over_from_trip_id UUID REFERENCES trips(id)`
- [x] Update `rowSchemas.ts` and all SplitRequest infra code to handle the new field

### 4.3 — Rollover UI flow

- [x] New screen `app/settle/rollover/[tripId].tsx`
- [x] Step 1 — "Pick a destination trip" — list of user's `active` or `settling` trips (exclude source trip)
- [x] Step 2 — "Review participant matches" — show matched / unmatched pairs; allow manual override
- [x] Step 3 — "Review debts to carry over" — list of unpaid debts with remapped names + amounts; user can deselect individual items
- [x] Step 4 — Confirm -> create SplitRequest rows in the target trip
- [x] Add "Roll Over Debts" button to `SettlementScreen` (visible when trip is `settling` and there are unpaid debts)

### 4.4 — Tests for Phase 4

- [x] `matchParticipants` — full coverage (see 4.1)
- [x] `computeRolloverDebts` — only `owed` debts are included; amounts preserved; IDs remapped
- [x] Rollover screen Step 1: renders destination trip list, calls `selectTargetTrip` on tap
- [x] Rollover screen Step 4: confirm button calls hook; disabled when no seeds selected
- [x] `SettlementScreen` Roll Over Debts button: shown/hidden by status + rollable debt presence

---

## Phase 5 — Close Trip ✅ DONE (2026-05-27, 686/686 tests)

**Goal:** a participant can close a trip with or without full settlement. Closed trips disappear from the active list.

### 5.1 — Close action

- [x] Add "Close Trip" button to `TripDetailScreen` header (archive icon), shown when `status !== 'closed'`
  - Confirmation Alert: "This will hide the trip from your list. Unsettled debts will still be recorded."
  - On confirm: `setTripStatus(tripId, 'closed')` then navigate back
- [x] Add "Close Trip" button to `SettlementScreen` (visible when `tripStatus !== 'closed'`)

### 5.2 — Active list filter

- [x] `useTrips` hook — filter returned trips to `status !== 'closed'`
- [x] `TripListScreen` — no UI changes needed once the hook filters correctly

### 5.3 — Future (not now)

- Archive/view closed trips screen — skip for now, just flag in the model

### 5.4 — Tests for Phase 5

- [x] `useTrips` excludes `closed` trips from the returned list (2 tests)
- [x] `TripDetailScreen` — close button shown/hidden by status; Alert fires; `setTripStatus('closed')` called on confirm
- [x] `SettlementScreen` — close button shown for `active`/`settling`, hidden for `closed`

---

## Cross-cutting concerns (address as each phase lands)

- [ ] `SettlementSkeleton` — update if new sections (banner, close button) need skeleton treatment
- [ ] Supabase RLS — ensure `trip_members` policy allows any member to UPDATE `split_requests.status`
- [ ] Audit log — fire an `AuditEvent` for every status transition (debt paid, reverted, trip closed, rollover created)
- [ ] `simulationContainer` / fixtures — add at least one `settling` trip to `restaurantScenario` so the settle screen is exercisable in sim mode without navigating

---

## Done

- **Phase 1 — Trip State Machine** (2026-05-27): `status` field on Trip model, migration 011, `setTripStatus` through full DI stack, expense-add guard, status-aware Settle Up button in TripDetailScreen, settling banner + Reopen in SettlementScreen. 622/622 tests.
- **Phase 2 — Debt Status: Manual Toggle** (2026-05-27): `owed`/`paid` statuses, `PAYMENT_FLOW_STATUSES` guard set, `markDebtPaid`/`markDebtOwed` in hook + store, `SettlementRow` context-sensitive action column, `SplitStatusBadge` exhaustive, `SettlementScreen` wired. 135/135 settlement tests.
- **Phase 3 — Payment Flow Integration** (2026-05-27): `appendSplitRequest` cache action, Stripe poller in `useSettlement`, `useFocusEffect` refetch for OB return, `ActivityIndicator` spinner for `pending`/`authorized` in `SettlementRow`. 177/177 tests.
- **Phase 4 — Debt Rollover** (2026-05-27): `matchParticipants` (userId → email → phone priority) + `computeRolloverDebts` pure logic layer; `rolledOverFromTripId` through full stack (model, migration 012, rowSchema, repo); `useRollover` 4-step wizard hook; `RolloverScreen` (Pick Trip → Match → Review → Confirm); "Roll Over Debts" button on `SettlementScreen`. 676/676 tests.
- **Phase 5 — Close Trip** (2026-05-27): `useTrips` filters out `closed` trips; "Close Trip" button (archive icon) in `TripDetailScreen` header and `SettlementScreen`; confirmation Alert; `closeTrip` action in `useSettlement`. 686/686 tests.
