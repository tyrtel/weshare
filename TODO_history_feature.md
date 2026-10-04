# Activity History Feed

## Goal

A place to see a chronological feed of activity ("who did what, when") across
a user's groups and trips, plus a "view history" entry point scoped to a
single group, trip, or expense. Each feed item links through the relevant
group → trip → expense chain so the user can jump straight to the source.

## Decisions (confirmed with user, 2026-09-15)

1. **Activity scope**: expense created/edited/deleted, payment/settlement
   events, group/trip lifecycle (created/renamed/archived), and
   group/trip membership changes (joined/left/invited).
2. **Feed shape**: one global "History" feed covering all of a user's groups
   and trips, plus a "View history" button on Group, Trip, and Expense
   screens that opens the same feed pre-filtered to that entity.
3. **Data source**: today there is no generic event log — only a narrow
   `AuditEvent` (Stripe settlement audit trail, `entityType` hardcoded to
   `'split_request'`, see `src/core/models/AuditEvent.ts`) and a *derived*
   balance ledger (`buildLedgerHistory` in `src/core/logic/settlement.ts`)
   that reconstructs running balances from current expense/payment records.
   Neither can show an edit, a delete, or a member who has since left, so we
   are adding a proper append-only `ActivityEvent` log rather than deriving
   the feed from current-state timestamps.
4. **Rollout**: phased. Instrument expense create/edit/delete first (highest
   value, most frequent activity), ship the feed against that, then add
   payment/settlement events, then group/trip lifecycle + membership events
   as follow-up chunks. The feed UI is built once and just gets richer as
   more event types land.
5. **Nav placement**: History gets its own top-level tab (alongside Trips,
   Summary, Reports), in addition to the per-screen "View history" buttons.
6. **Pagination**: infinite scroll, cursor-based, matching the
   `IActivityLogRepository` query shape already planned.

## Architecture

New `ActivityEvent` model, separate from the existing settlement-only
`AuditEvent` (left untouched — still used by `AuditDetailScreen`).

    src/core/models/ActivityEvent.ts
      { id, eventType, entityType: 'expense'|'group'|'trip'|'member',
        entityId, groupId?, tripId?, expenseId?, actorUserId, createdAt,
        payload }

`groupId`/`tripId`/`expenseId` are carried on every event (not just the
entity's own id) so a feed row can render the full breadcrumb
(group → trip → expense) and each segment can link out, even after the
child entity itself is edited or deleted later.

    src/core/interfaces/IActivityLogRepository.ts
      appendEvent(event)
      getEventsForGroup(groupId, { limit, before })
      getEventsForTrip(tripId, { limit, before })
      getEventsForExpense(expenseId)

    src/infrastructure/supabase/SupabaseActivityLogRepository.ts
    src/__mocks__/InMemoryActivityLogRepository.ts

No `getEventsForUser` — this app's persistence is Supabase (not SQLite;
corrected from the original draft above), and every other repo in this
codebase already fetches per-group/per-trip and merges client-side rather
than exposing a cross-entity "for this user" query (see
`useGroupLedgerHistory.ts`). The Chunk C feed hook follows the same
pattern: call `getEventsForGroup`/`getEventsForTrip` once per group/trip
the user belongs to and merge+sort the pages client-side.

DI: `ACTIVITY_LOG` token added, registered in `productionContainer.ts` /
`testContainer.ts` / `simulationContainer.ts`. Done.

    src/features/history/
      components/   ActivityFeedItem.tsx, EntityBreadcrumb.tsx
      hooks/        useActivityFeed.ts, useGroupActivityFeed.ts,
                    useTripActivityFeed.ts, useExpenseActivityFeed.ts
      screens/      ActivityFeedScreen.tsx
      utils/        formatActivityEvent.ts (eventType -> copy + icon),
                    groupEventsByDay.ts
      __tests__/

Nav: `app/history/index.tsx` (global feed) and `app/history/[filter].tsx`
or query params (`?groupId=`/`tripId=`/`expenseId=`) for scoped views,
reached via a "View history" button added to Group detail, Trip detail,
and Expense detail screens. Open question below on whether it also gets a
tab.

## Changes — Chunk A: event log foundation — DONE (2026-09-15)

- [x] `ActivityEvent` model + `IActivityLogRepository` interface. Every
      event carries `groupId`/`tripId`/`expenseId` (not just `entityId`)
      so a feed row can render the group -> trip -> expense breadcrumb
      even after a child entity is later edited or deleted.
- [x] `SupabaseActivityLogRepository` + `InMemoryActivityLogRepository`
- [x] `supabase/migrations/045_activity_log.sql` — `activity_events` table,
      RLS reusing `is_group_member()`/`is_trip_member()` (read: member of
      the scoped group or trip; insert: actor must be `auth.uid()` and a
      current member — append-only, no update/delete policy)
- [x] `ACTIVITY_LOG` DI token, wired into `tokens.ts` +
      `productionContainer.ts` + `testContainer.ts` (with `ContainerOverrides`
      support) + `simulationContainer.ts`
- [x] Repository unit tests (mock + Supabase) covering append, per-group/
      per-trip/per-expense queries, and cursor pagination
- [x] Full suite green: 127/127 suites, 1523/1523 tests; lint clean

## Changes — Chunk B: instrument expenses — DONE (2026-09-15)

Four mutation call sites instrumented, each fire-and-forget
(`.catch(() => {})`, matching `useCreateGroupExpense`'s existing
notification pattern — activity logging must never block or fail the
actual mutation):

- [x] `useAddExpense.ts` — `expense.created` (trip-scoped)
- [x] `useCreateGroupExpense.ts` — `expense.created` (group-scoped)
- [x] `useEditExpense.ts` — `expense.updated` (shared trip/group edit path)
- [x] `tripSessionStore.ts` `removeExpense`/`removeGroupExpense` —
      `expense.deleted`. Delete is triggered directly from screens via
      `storeApi.getState().removeExpense(...)`, not a hook, so this is
      instrumented in the store itself (which already owns the
      `repos.expenses.deleteExpense` call) rather than duplicated across
      `ExpenseDetailScreen.tsx` and `app/group/expense/[id].tsx`. Added
      `auth`/`activityLog` to `TripStoreRepos` so the store can resolve the
      actor and log the event without changing either screen's call
      signature.
- [x] Shared `newActivityEvent()` factory (`src/core/utils/activityEvents.ts`)
      to avoid repeating id/createdAt stamping at all 4 sites
- [x] Payload kept minimal: `{ description, totalAmountCents, currency }`
      for created/updated, `{ description }` for deleted (snapshotted from
      store state before the row is removed)
- [x] Tests: one assertion per hook/store-action confirming the event lands
      with correct `eventType`/`groupId`/`tripId`/`expenseId`
- [x] Full suite green: 127/127 suites, 1528/1528 tests; lint clean

## Changes — Chunk C: feed UI (global + scoped) — DONE (2026-09-15)

- [x] `src/features/history/` module:
  - `utils/describeActivityEvent.ts` — eventType -> icon + i18n key/params
  - `utils/resolveBreadcrumb.ts` — builds the group -> trip -> expense chain;
    resolves a trip's parent group via `trip.groupId` (an event's own
    `groupId` is only set for direct group expenses, never for a trip-scoped
    expense whose trip happens to belong to a group — see file comment).
    Leaf segment is non-linkable for `expense.deleted`.
  - `utils/groupEventsByDay.ts` — day-bucketing + Today/Yesterday/date label
  - `hooks/usePaginatedActivityFeed.ts` — shared cursor-pagination core
  - `hooks/useGroupActivityFeed.ts` / `useTripActivityFeed.ts` — thin
    wrappers over the shared core, real infinite scroll (single source)
  - `hooks/useExpenseActivityFeed.ts` — flat, unpaginated (matches
    `getEventsForExpense`'s interface shape)
  - `hooks/useActivityFeed.ts` — global feed, see limitation note below
  - `components/ActivityFeedItem.tsx`, `components/ActivityFeedList.tsx`
    (shared day-grouped `SectionList`, one per scope's screen container),
    `components/ViewHistoryLink.tsx` (shared entry-point row)
  - `screens/ActivityFeedScreen.tsx` (global), `GroupActivityFeedScreen.tsx`,
    `TripActivityFeedScreen.tsx`, `ExpenseActivityFeedScreen.tsx` — one
    hook call each rather than a single scope-switching screen, so a scoped
    screen never pays for the global feed's group+trip fan-out
- [x] Routes: `app/(tabs)/history.tsx` (new History tab, alongside
      Trips/Summary/Reports), `app/history/group/[groupId].tsx`,
      `app/history/trip/[tripId].tsx`, `app/history/expense/[expenseId].tsx`
- [x] Nav: History tab added to both `app/(tabs)/_layout.tsx` and the real
      tab bar UI, `UniversalTabBar.tsx` (the `Tabs` navigator's own bar is
      hidden — `UniversalTabBar` is what actually renders)
- [x] "View history" button (`ViewHistoryLink`) added to
      `app/group/[id].tsx`, `TripDetailScreen.tsx`, `ExpenseDetailScreen.tsx`
      (trip-scoped expense), `app/group/expense/[id].tsx` (group-scoped
      expense) — each opens the matching scoped route
- [x] i18n keys added under a new `history` namespace (en + fr)
- [x] Tests: pure utils (describeActivityEvent, resolveBreadcrumb,
      groupEventsByDay/formatDaySectionLabel), all 4 feed hooks, one
      component test (ActivityFeedItem — description text, breadcrumb
      navigation, non-linkable deleted-expense segment), UniversalTabBar's
      new tab. 33 new tests.
- [x] Full suite green: 136/136 suites, 1565/1565 tests; lint clean

**Update (2026-09-19): the above limitation is fixed.** Added
`IActivityLogRepository.getEventsForUser(scope, query)` — a single merged,
sorted, cursor-paginated query across every group/trip in `scope`, not N
per-source fetches merged in JS:

- `ActivityFeedScope = { groupIds: string[]; tripIds: string[] }` — the
  caller's own memberships, already available for free via
  `useGroups()`/`useTrips()` (matches the existing convention of
  `getTripsForUser(userId)` etc. taking an explicit id rather than the
  repository resolving membership itself).
- Supabase impl: one query with `.or('group_id.in.(...),trip_id.in.(...)')`,
  answered by the same two indexes `getEventsForGroup`/`getEventsForTrip`
  already use (`activity_events_group_idx` / `_trip_idx`) — no new index
  needed. RLS's existing SELECT policy (same `is_group_member`/
  `is_trip_member` predicate) still enforces the real access boundary
  independently, so a caller passing the wrong/no scope can only narrow
  results, never see events it isn't entitled to.
- InMemory mock: same filter, reusing the existing `paginate()` helper.
- `useActivityFeed()` now just calls `usePaginatedActivityFeed` with
  `getEventsForUser` bound to the scope — identical shape to
  `useGroupActivityFeed`/`useTripActivityFeed`, real infinite scroll, no
  client-side merge/sort/PER_SOURCE_LIMIT left at all.
- 136/136 suites, 1573/1573 tests, lint clean; no new `tsc` errors beyond
  the pre-existing untyped-table gap this table already had.

## Changes — Chunk D: payment/settlement events

- [ ] Append events at payment-request / payment-confirmed / settlement
      call sites (reuse learnings from existing `AuditEvent` wiring in
      settlement flows, but write to the new general log so it shows in the
      same feed)
- [ ] Tests

## Changes — Chunk E: group/trip lifecycle + membership events

- [ ] group/trip created, renamed, archived
- [ ] member invited, joined, left
- [ ] Tests

