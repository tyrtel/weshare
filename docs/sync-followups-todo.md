# Sync follow-ups todo

> **Status (2026-10-12).** Not started. These were left out of the caching work
> (`docs/caching-todo.md`) on purpose. Each needs a decision before building. Items
> 1–3 are the "left for later" list; 4–8 were found while building the cache.
> Suggested order: 2 → 1 → 3, with the small ones (4–8) whenever convenient.

## 1. Change feed from `activity_events`

**Idea:** on foreground (and on a timer while Realtime is down), ask the server
"what changed since cursor X?" and refresh only the affected buckets, instead of
revalidating every stale bucket on screen.

**Why it's not urgent:** Realtime covers the foreground; focus/foreground
revalidation covers the rest. This only saves requests and catches changes to
buckets that aren't on screen.

**Blocker found:** the app only logs `expense.created/updated/deleted` today.
Payments, member changes and trip/group lifecycle aren't logged yet (History
feature phases D/E), so a feed built now would miss them. Do History D/E first.

- [ ] Decide: build after History D/E, or drop in favour of Realtime alone?
- [ ] Per-device cursor (last seen `created_at` + id), stored with the cache envelope.
- [ ] `getEventsSince(cursor)` on `IActivityLogRepository` (RLS already scopes events).
- [ ] Map events → buckets (reuse `bucketsForChange`-style pure function) →
      `notifyRemoteChange`.
- [ ] Cap: if more than N events since the cursor, just revalidate everything.
- [ ] Tests: cursor advances; gap larger than cap falls back; unknown event types ignored.

## 2. Conflicting edits

**Today:** the last save wins. Two people editing the same expense silently
overwrite each other, and an edit is three requests (update expense, delete
splits, insert splits), so a failure part-way leaves the server half-changed.
The cache already recovers from that by refetching, but the server data is still wrong.

- [ ] Migration: `updated_at` on `expenses` with the existing `set_updated_at()`
      trigger (as on `split_requests`); add to the model, row schema and Zod schema.
- [ ] Move "edit expense + replace splits" into one Postgres function (RPC) so it is
      a single transaction: fixes the part-way failure for good.
- [ ] The RPC takes the `updated_at` the client last saw and refuses if it changed
      (compare-and-set) → new `ConflictError` kind.
- [ ] Store: on `ConflictError`, revert, refetch the bucket, and show "Someone else
      changed this expense — your edit wasn't saved" (reuse `WriteErrorBanner` with a
      distinct message).
- [ ] Same treatment for trip/group edits that carry a currency change across
      expenses (also several requests today).
- [ ] Tests: concurrent edit → conflict surfaced; RPC is all-or-nothing.

## 3. Offline edits (write queue)

**Today:** writes and payments need a connection. Save-first writes made offline
are undone after the request fails.

**Prerequisites:** item 2 (conflict detection and atomic RPCs). Client-generated ids
already exist, which makes replays idempotent.

- [ ] Decide scope: expenses only? Never payments (provider status must be real).
- [ ] Persisted queue of pending writes (in the encrypted cache envelope).
- [ ] Replay on reconnect (NetInfo) in order; stop at the first conflict and ask.
- [ ] UI: pending badge on queued items; "N changes waiting to sync" banner.
- [ ] Tests: queue survives restart; replay order; conflict halts the queue.

## 4. Pushes only cover one event

Only "group expense added" sends a push. Trip expenses, payments recorded, payment
requests and member changes don't, so Phase 6's refresh-on-notification only helps
for that one case.

- [ ] Decide which of the events in `docs/notifications-analysis.md` should push.
- [ ] Each sender includes `tripId`/`groupId` in the payload (the Edge Function and
      `usePushRefresh` already handle both).

## 5. Tapping a notification doesn't open anything

- [ ] Navigate to the trip/group from `addNotificationResponseReceivedListener`
      (ids are now in the push data).

## 6. Expense detail fetches members on every visit

`ExpenseDetailScreen` calls `memberRepo.getMembersForTrip` directly each time,
even though the trip's members are already cached (`store.members[tripId]`).

- [ ] Read members from the store; fetch only when the trip bucket isn't loaded.

## 7. Cache size guard

The cache is dropped (not written) above 2 M characters to stay well inside
Android's 6 MB AsyncStorage limit. Heavy users would lose the instant cold start.

- [ ] Add a breadcrumb/metric for cache size to see if anyone gets close.
- [ ] If they do: leave closed trips' expenses out of the persisted copy first.

## 8. Own-write echoes over Realtime

Every save-first write comes back as a Realtime event and triggers one refetch of
that bucket. It's harmless but wasted.

- [ ] Option: remember ids written in the last few seconds and skip their echoes.
      Only worth it if request volume shows up as a problem.
