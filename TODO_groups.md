# Groups Feature — Design & Implementation Plan

---

## Overview

Groups are a persistent collection of friends a user expects to share many trips or expenses with over time. A group holds a running total across multiple trips, one-off expenses, and (future) recurring expenses. Once a trip or expense inside a group is settled, it drops off the main group view but remains accessible as a past item.

The home tab is redesigned from a flat trip list into a unified view of groups + standalone (ungrouped) trips.

---

## Data Model Changes

### New models

**Group** (`src/core/models/Group.ts`)

    id: string
    name: string
    currency: string       // default currency for trips/expenses in this group
    ownerId: string
    createdAt: Date
    members: GroupMember[]
    inviteToken?: string   // same 8-char pattern as Trip.inviteToken

**GroupMember** (`src/core/models/GroupMember.ts`)

    userId: string
    groupId: string
    displayName: string
    joinedAt: Date
    isGuest: boolean
    phone?: string
    email?: string
    avatarUrl?: string

### Extended existing models

**Trip** — add one field:

    groupId?: string    // nullable FK to the owning group; absent = standalone trip

**Expense** — add three fields:

    tripId?: string         // was required; now optional (absent for group-level expenses)
    groupId?: string        // set for group-level expenses; absent for trip expenses
    settledAt: Date | null  // group expenses only — null = active, Date = settled/off main view

**Split** — no changes.

---

## DB Schema

### New tables (migration 025_groups.sql)

    groups
      id            text PK
      name          text NOT NULL
      currency      text NOT NULL
      owner_id      text NOT NULL
      created_at    timestamptz NOT NULL DEFAULT now()
      invite_token  text

    group_members
      group_id      text NOT NULL REFERENCES groups(id) ON DELETE CASCADE
      user_id       text NOT NULL
      display_name  text NOT NULL
      is_guest      bool NOT NULL DEFAULT false
      joined_at     timestamptz NOT NULL DEFAULT now()
      phone         text
      email         text
      avatar_url    text
      PRIMARY KEY (group_id, user_id)

### Columns added to existing tables

    trips.group_id          text REFERENCES groups(id) ON DELETE SET NULL
    expenses.group_id       text REFERENCES groups(id) ON DELETE CASCADE
    expenses.trip_id        ALTER COLUMN trip_id DROP NOT NULL  (make nullable)
    expenses.settled_at     timestamptz

---

## New Service Interface

**IGroupRepository** (`src/core/interfaces/IGroupRepository.ts`)

    getGroup(id: string): Promise<Result<Group, AppError>>
    getGroupsForUser(userId: string): Promise<Result<Group[], AppError>>
    getGroupByInviteToken(token: string): Promise<Result<Group, AppError>>
    saveGroup(group: Group): Promise<Result<Group, AppError>>
    updateGroup(group: Group): Promise<Result<Group, AppError>>
    deleteGroup(id: string): Promise<Result<void, AppError>>

## Extended Existing Interface

**IExpenseRepository** — two methods added:

    getExpensesForGroup(groupId: string): Promise<Result<Expense[], AppError>>
    settleExpense(id: string, settledAt: Date): Promise<Result<Expense, AppError>>

---

## Navigation

### Tab bar

Rename "Trips" tab → "Home". Update `isActive` predicate in `UniversalTabBar` to also match `/group/*` routes.

### New routes (add to root Stack in `app/_layout.tsx`)

    /group/create              CreateGroupScreen
    /group/[id]                GroupDetailScreen
    /group/edit                EditGroupScreen
    /group/expense/add         GroupExpenseFormScreen
    /group/expense/[id]        GroupExpenseDetailScreen
    /group/settle/[id]         GroupSettlementScreen

### Modified route

    /trip/create               gains optional ?groupId= query param

---

## Screen Designs

### HomeScreen (replaces TripListScreen at `app/(tabs)/index.tsx`)

SectionList with two sections:

- **Groups** — one `GroupCard` per group the user belongs to
- **Trips** — standalone (ungrouped) trips only, using the existing `TripCard`

`GroupCard` shows: group name, member avatar row (up to 5), active item count ("3 trips · 1 expense"), net balance pill ("You owe €24" / "You're owed €15" / "All settled"). Tapping navigates to `GroupDetailScreen`.

FAB: two actions — "New group" and "New trip" (ungrouped). Each section has its own empty state.

### GroupDetailScreen (`app/group/[id].tsx`)

Header: group name, edit button, member avatar row, per-member balance summary ("Jay owes Sarah €30").

Main list: SectionList with two sections:
- **Active** — TripCards (trips where `trip.groupId === id`) and GroupExpenseCards (group expenses where `settledAt` is null), interleaved by `createdAt`
- **Past** — closed trips and settled group expenses; hidden behind a "View past items" toggle

Tapping a trip card → existing `TripDetailScreen`. Tapping a group expense card → `GroupExpenseDetailScreen`.

FAB: two actions — "New trip" (→ `/trip/create?groupId=...`) and "New expense" (→ `/group/expense/add?groupId=...`).

### CreateGroupScreen (`app/group/create.tsx`)

Name input, currency picker. Member invite deferred to a later iteration — group starts with just the owner; members are added via invite.

### Trip creation from a group

When `CreateTripScreen` receives `?groupId`, it adds a member subset picker: a list of all `GroupMember` records with checkboxes, all selected by default. The selected subset becomes the initial `TripMember` list. Trip is saved with `groupId` set.

### GroupExpenseFormScreen (`app/group/expense/add.tsx`)

Thin wrapper around the existing expense form primitives. Receives `?groupId` instead of `?tripId`. Participant picker defaults to all group members. Saves an `Expense` with `groupId` set and `tripId` absent.

### GroupSettlementScreen (`app/group/settle/[id].tsx`)

Cross-trip + cross-group-expense minimum-cash-flow settlement suggestions for the group. Who pays whom, amounts, action buttons.

---

## Balance Computation

Pure function `computeGroupBalances(groupId, trips, allExpenses, allSplits)`:
1. Collect all `Expense[]` where `expense.tripId` is in a trip whose `groupId` matches, plus all `Expense[]` where `expense.groupId` matches directly
2. Collect corresponding `Split[]` for those expenses
3. Net per-member positions → minimum-cash-flow settlement list

This drives `GroupCard` balance pill, `GroupDetailScreen` header, and `GroupSettlementScreen`.

---

## Chunk Plan

### Chunk A — Data Foundation
**Status:** [x] COMPLETE — 797/797 tests pass

- [x] Create `src/core/models/Group.ts`
- [x] Create `src/core/models/GroupMember.ts`
- [x] Create `src/core/interfaces/IGroupRepository.ts`
- [x] Create `src/infrastructure/supabase/SupabaseGroupRepository.ts`
- [x] Create `src/__mocks__/InMemoryGroupRepository.ts`
- [x] Add `GROUP_REPO` token to `src/core/di/tokens.ts`
- [x] Register `GROUP_REPO` in `productionContainer.ts`, `testContainer.ts`, `simulationContainer.ts`
- [x] Edit `src/core/models/Trip.ts` — add `groupId?: string`
- [x] Edit `src/core/models/Expense.ts` — `tripId` → optional; add `groupId?: string`; add `settledAt: Date | null`
- [x] Edit `src/core/interfaces/IExpenseRepository.ts` — add `getExpensesForGroup` and `settleExpense`
- [x] Edit `src/infrastructure/supabase/rowSchemas.ts` — `expenseRowSchema`: `trip_id` nullable, add `group_id` nullable, add `settled_at` nullable; `tripRowSchema`: add `group_id` nullable
- [x] Edit `src/infrastructure/supabase/SupabaseExpenseRepository.ts` — update `rowToExpense`, `saveExpense`, `updateExpense` for nullable tripId/groupId/settledAt; add `getExpensesForGroup` and `settleExpense` methods
- [x] Edit `src/__mocks__/InMemoryExpenseRepository.ts` — add `getExpensesForGroup` and `settleExpense`
- [x] Edit `src/store/tripSessionStore.ts` — guard call sites that use `expense.tripId` as non-optional
- [x] Edit `src/features/expenses/screens/ExpenseDetailScreen.tsx` — guard 2 call sites using `expense.tripId` as non-optional
- [x] Edit `src/__testUtils__/factories.ts` — add `groupFactory`, `groupMemberFactory`; add `settledAt: null` to `expenseFactory` default
- [x] Create `supabase/migrations/025_groups.sql` — groups + group_members tables; alter expenses (trip_id nullable, add group_id, add settled_at); add trips.group_id; RLS policies
- [x] Create `src/__mocks__/__tests__/InMemoryGroupRepository.test.ts` — CRUD coverage for all 6 methods
- [x] Create `src/__mocks__/__tests__/InMemoryExpenseRepository.test.ts` — covers `getExpensesForGroup` and `settleExpense`

**Depends on:** Nothing. Starts immediately.

---

### Chunk B — Session Store + Startup
**Status:** [x] COMPLETE — 808/808 tests pass

- [x] Extend `TripSessionStore` state: add `groups: Group[]`, `groupExpenses: Record<string, Expense[]>` (keyed by groupId)
- [x] Add `groups: IGroupRepository` to `TripStoreRepos`; wire into all three containers
- [x] Add store actions: `loadGroups(userId)` (with concurrency dedup), `appendGroup`, `updateGroupInStore`, `removeGroup`
- [x] Add store actions: `loadGroupDetail(groupId)`, `addGroupExpense(expense)` (optimistic), `settleGroupExpenseInStore(expenseId, groupId, settledAt)`
- [x] Update `expenseSchema` and `tripSchema` in `billSessionSchema.ts` for new optional fields; add `groupSchema`, `groupMemberSchema`
- [x] Update `AuthGate` startup to call `loadGroups(userId)` in parallel with `loadTripDetail` calls
- [x] Create `src/store/__tests__/groupSessionStore.test.ts` — covers all new store actions
- [x] Updated `src/store/__tests__/tripSessionStore.test.ts` — added `groups` repo to fixtures

**Depends on:** Chunk A.

---

### Chunk C — Home Screen + Group CRUD + Group Detail
**Status:** [x] COMPLETE — 834/834 tests pass

- [x] Hooks: `useGroups`, `useCreateGroup`, `useGroupDetail(groupId)`, `useEditGroup`, `useDeleteGroup`
- [x] `src/features/groups/components/GroupCard.tsx` — name, member avatars, item count
- [x] Rewrite `app/(tabs)/index.tsx` as `HomeScreen` — SectionList: Groups section + Trips section; FAB with two actions; per-section empty states
- [x] `src/components/ui/UniversalTabBar.tsx` — rename "Trips" → "Home"; update `isActive` to include `/group` prefix
- [x] `app/group/create.tsx` — `CreateGroupScreen`: name input + currency picker
- [x] `app/group/[id].tsx` — `GroupDetailScreen`: member row, active items (TripCards + GroupExpenseItems), past-items toggle, FAB
- [x] `app/group/edit.tsx` — `EditGroupScreen` with delete
- [x] `app/_layout.tsx` — added `group/create`, `group/[id]`, `group/edit` to root Stack
- [x] Added i18n keys for `home.*` and `groups.*` to `en.json` and `fr.json`
- [x] Tests: `useGroups`, `useCreateGroup`, `useGroupDetail`, `useEditGroup`, `useDeleteGroup` (26 hook tests)
- [x] Fixed `UniversalTabBar.test.tsx` to match new "Home" label

**Depends on:** Chunk B.

---

### Chunk D — Trip-in-Group
**Status:** [x] COMPLETE — 840/840 tests pass

- [x] `app/trip/create.tsx` — detects `?groupId` query param via `useLocalSearchParams`
- [x] `useCreateTrip` extended: optional `opts.groupId` and `opts.selectedGroupMembers`; maps GroupMember[] → TripMember[]; deduplicates creator; saves trip with groupId set
- [x] Two-step `CreateTripScreen`: step 1 = name/currency (existing); step 2 (when groupId present) = `CheckRow` member subset picker with all members checked by default
- [x] Currency defaults to group's currency when `groupId` is present
- [x] `GroupDetailScreen` FAB "New trip" passes `?groupId=...` correctly
- [x] Added i18n keys: `trips.create.member_picker_title/heading/subtitle` to en.json and fr.json
- [x] Tests: `useCreateTripInGroup.test.ts` — 6 tests covering groupId propagation, member dedup, standalone backward-compat

**Depends on:** Chunk C.
**Parallel with:** Chunk E.

---

### Chunk E — One-off Group Expenses
**Status:** [x] COMPLETE — 860/860 tests pass

- [x] Hooks: `useCreateGroupExpense(groupId)`, `useSettleGroupExpense`
- [x] `src/features/groups/components/GroupExpenseCard.tsx` — description, payer, amount, settled badge
- [x] `app/group/expense/add.tsx` — receives `?groupId`; adapts GroupMember[] to PayerSelector/equalSplit; saves Expense with groupId, no tripId
- [x] `app/group/expense/[id].tsx` — header, split breakdown, settle button
- [x] Added `appendGroupExpense` store action (direct append without re-saving)
- [x] `GroupDetailScreen` active/past items use `GroupExpenseCard`, navigate to detail screen
- [x] Added `group/expense/add` and `group/expense/[id]` routes to `_layout.tsx`
- [x] Added i18n keys: `groups.expense.*` to en.json and fr.json
- [x] Tests: `useCreateGroupExpense` (7 tests), `useSettleGroupExpense` (5 tests)

**Depends on:** Chunk C.
**Parallel with:** Chunk D.

---

### Chunk F — Group-Level Balances + Settlement
**Status:** [x] COMPLETE — 860/860 tests pass

- [x] Pure function `computeGroupBalances(memberUserIds, groupTrips, tripExpenses, groupExpenses)` in `src/features/groups/utils/computeGroupBalances.ts`
- [x] `app/group/settle/[id].tsx` — `GroupSettlementScreen`: per-member balance table + suggested transfers; "All settled" empty state
- [x] `useGroupDetail` extended: exposes `settlements` and `memberBalances`
- [x] `useGroups` extended: exposes `groupSummaries` (owe/owed/even/no-data per group)
- [x] `GroupCard` balance pill wired to real `groupSummaries` data
- [x] `GroupDetailScreen` header: member balance row + "Settle up" button (navigates to settlement screen)
- [x] Added `group/settle/[id]` route to `_layout.tsx`
- [x] Added i18n keys: `groups.settle.*` and `groups.detail.settle_up` to en.json and fr.json
- [x] Unit tests: `computeGroupBalances.test.ts` — 7 tests

**Depends on:** Chunks D and E.

---

## Dependency Graph

    A (Data Foundation)        — no deps
    └── B (Store + Startup)    — needs A
          └── C (Home + CRUD)  — needs B
                ├── D (Trip-in-Group)    ─┐
                └── E (Group Expenses)   ─┴── F (Balances + Settlement)

D and E have no dependency on each other — safe to run in parallel after C completes.
F cannot start until both D and E are done.

---

## What is explicitly deferred

- Recurring group expenses (mentioned as future)
- Group invite flow (members added via invite link — infrastructure exists via `inviteToken` field, screen deferred)
- Cross-group balance rollover (similar to existing trip rollover, out of scope here)
