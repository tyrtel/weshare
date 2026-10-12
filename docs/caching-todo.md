# Caching & sync todo

> **Status (2026-10-12).** All six phases built; full suite green (1646 tests,
> type-check unchanged from baseline, lint clean). **Nothing deployed.** Waiting on:
> (1) a new dev/EAS build for `expo-crypto`, (2) your OK to push migration 046 and
> deploy `send-queued-notification`, (3) your on-device testing before any checkpoint
> is ticked. Follow-ups that were deliberately left out: `docs/sync-followups-todo.md`.
> Decisions made: force-sync shows cached data with a "Syncing…" banner and
> blocks money actions; cache is encrypted on device; in scope are save-first
> edits with rollback, Supabase Realtime, push-notification refresh, and the
> trips-list query fix.

## Why it feels slow today

- `useTrips` sets `loading: true` on every focus, even with trips already in the
  store, and re-runs `loadTripDetail` for every trip (1 + 2N requests per visit).
- `useTripDetail` starts in `loading: true` and refetches on every focus.
- Nothing is persisted, so a cold start always waits on the network (including
  the 10–20 s free-tier PostgREST cold connection).
- The store has no record of when anything was fetched, so it cannot tell fresh
  from stale and every hook refetches defensively.
- No Realtime subscriptions — other members' changes only show on refetch.

## Design

Build on the existing `tripSessionStore` (already the single source of truth),
not a new library. Each cache bucket gets a `fetchedAt` timestamp:

| Age | Behaviour |
|---|---|
| < 30 s (`FRESH_MS`) | Serve cache, no request |
| 30 s – 12 h | Serve cache instantly, revalidate in background; spinner only when the bucket is empty |
| > 12 h (`FORCE_SYNC_MS`) | Serve cache with "Syncing…" banner; settle / pay / delete disabled until the sync lands |

Buckets: `trips`, `groups`, `trip:<id>` (expenses + members), `group:<id>`
(expenses), `tripRequests:<id>`, `groupRequests:<id>`, `recurring:<groupId>`.

Thresholds are constants in one place and easy to tune.

## Phase 1 — Freshness tracking + stale-while-revalidate (in memory)

- [x] `fetchedAt` on `TripSessionState`; every `load*` action stamps its bucket on
      success (a failed load leaves it unstamped). `revalidate(bucket, {force})`
      skips fresh buckets and shares one in-flight request per bucket;
      `invalidate(bucket)` clears a stamp. New `loadRecurringExpenses` (store now
      takes the recurring repo) so recurring templates are a bucket too.
- [x] `src/core/logic/cacheFreshness.ts` — `freshness()`, bucket key builders,
      `FRESH_MS` / `FORCE_SYNC_MS`; unit tested.
- [x] `src/hooks/useCacheRevalidation.ts` — revalidates on focus and on AppState
      `active` while focused; `loading` only while a bucket has never been fetched
      and the first attempt hasn't settled (a failed first load can't spin forever);
      `refresh()` forces.
- [x] Reworked `useTrips`, `useClosedTrips`, `useTripDetail`, `useExpenseDetail`
      (served from cache when present, single fetch only for deep links),
      `useGroups`, `useGroupDetail`, `useRecurringExpenses`, `useSettlement`;
      `SettlementScreen`'s forced refetch-on-focus removed.
      **Behaviour change:** group screens used to load once per session and never
      refresh; they now revalidate like everything else.
- [x] Tests: store freshness/dedup/invalidate; hook (cached → no spinner, fresh →
      no request, foreground → stale refetch, failed first load stops loading);
      useTrips return-to-list. Several group/feed tests seeded the store only and
      were changed to seed the in-memory repos, since hooks now revalidate.
- Found: the store is never reset on sign-out (screens only hide data when signed
  out). Harmless in memory today; fixed in Phase 3 where it would leak across
  accounts via the persisted cache.

**Checkpoint 1:** navigating back and forth within a session is instant. ☐

## Phase 2 — Trips list queries

- [x] `getExpensesForTrips(ids)` / `getMembersForTrips(ids)` on the interfaces,
      Supabase repos and in-memory repos. Supabase versions page in 1000-row chunks
      (PostgREST's default `max_rows`) so a large history isn't silently truncated.
      RLS applies to `in(...)` queries exactly as to `eq(...)`, so scoping is unchanged.
- [x] `loadTrips` fills and stamps every trip bucket from the two batched calls; if
      they fail the list still loads and trips fall back to per-trip fetches.
      AuthGate's per-trip `loadTripDetail` loop removed.
- [x] Tests: batched store load (no per-trip calls), failure fallback, Supabase
      grouping/paging/empty/error.

**Checkpoint 2:** trips list cold load is 3 requests. ☐

## Phase 3 — Encrypted on-device persistence + force sync

> Correction to what was discussed: the existing `LargeSecureStore` is **not** a
> good fit. It splits values into 1.8 KB SecureStore entries written one after
> another — fine for a session token, but a few hundred expenses would mean
> hundreds of Keychain/Keystore writes on every save. Instead:

- [x] `ICacheStorage` + `CACHE_STORAGE` token (4-step pattern).
      `src/infrastructure/cache/EncryptedCacheStorage.ts`: one random 256-bit key in
      SecureStore; AES-256-GCM (`@noble/ciphers` 2.2.0) with a fresh 12-byte nonce per
      write; base64 ciphertext in AsyncStorage. Tampered data or a missing key →
      treated as no cache. `InMemoryCacheStorage` for tests and simulation.
      **New dependencies: `@noble/ciphers` (pure JS) and `expo-crypto` (native → needs
      a new dev/EAS build before testing on device).**
- [x] `src/store/cachePersistence.ts` instead of Zustand `persist`: the cache is
      per-user and the user is only known after auth, which `persist` (fixed key at
      store creation) handles poorly. Saves the data slices + `fetchedAt` only,
      debounced 1 s, flushed when the app backgrounds; unconfirmed optimistic
      expenses are left out.
- [x] Envelope carries `userId` + `CACHE_SCHEMA_VERSION`; either mismatching →
      discarded. Revived through the existing Zod schemas (dates restored, malformed
      rows dropped); split requests and recurring templates have explicit date revivers.
- [x] Size guard: above 2 M characters the cache is dropped rather than written
      (Android's AsyncStorage database defaults to 6 MB in total).
- [x] AuthGate: restores the cache and renders immediately (no waiting on the first
      `loadTrips`), falling back to the old blocking load when there's no cache. On
      sign-out or account switch: `resetSession()` + wipe of cache and key (fixes the
      Phase 1 finding). Debug reset also wipes.
- [x] `useCacheExpired(buckets)` + `SyncBanner`. Banner on home, settlement, group
      settle, trip expense detail, group expense detail. While expired: pay / record
      payment / close trip hidden on the settlement screen; record / Wero pay hidden
      and "settle all" disabled on group settle; delete hidden on both expense screens.
- [x] Tests: encryption round trip, ciphertext never contains plaintext, tamper,
      lost key, clear leaves other storage alone; persistence round trip with dates,
      debounce, unrelated changes ignored, other user / old version / corrupt →
      discarded, pending expenses excluded, stop, size guard; settlement screen
      expired vs fresh.

**Checkpoint 3:** cold start shows last-known data instantly; >12 h shows the banner
and blocks money actions until synced. ☐

## Phase 4 — Save-first edits with rollback

Adds already worked this way (`addExpense` + `pendingExpenseIds`). Now also:

- [x] One store helper, `saveFirst(apply, revert, persist, buckets)`: apply to the
      cache → persist → on refusal or throw, revert, set `writeError`, and force a
      refetch of the affected buckets (several writes are multi-request and can land
      part-way, so the server is the source of truth after a failure).
- [x] Edit expense (trip + group) — moved from `useEditExpense` into the store's
      `editExpense` so it can finish after the form closes. The hook now validates,
      applies and returns at once.
- [x] Delete expense (trip + group) — screens navigate back immediately.
- [x] Close / reopen group expense — new `settleGroupExpense` store action, used by
      the group expense screen and the group detail quick action.
- [x] Record payment (trip, group, ledger history) and settle all group debts —
      every payment appears at once; only the ones the server refuses are undone.
- [x] Split request status changes (`updateSplitRequest`).
- [x] Trip status (`setTripStatus`), trip edit and group edit (`editTrip` / `editGroup`
      in the store, incl. carrying a currency change over to the expenses).
- [x] `WriteErrorBanner` (global, under the offline banner): "Couldn't save your last
      change — it has been undone"; tap to dismiss, auto-hides after 6 s.
- [x] Hook APIs simplified: `loading` removed from `useEditExpense`/`useEditTrip`/
      `useEditGroup`, `loading`/`error` from `useSettleAllGroupDebts`, `settling`/
      `recording` busy flags from the settlement and ledger hooks. Two now-unused
      translation keys removed.
- **Deliberately not save-first:** provider payment flows (Stripe, Tink, Wero,
      `BankPaymentScreen`) — their status must come from the payment provider, not
      the app's guess. `markSettled` is untouched (no callers outside tests).
- [x] Tests: store (applied before server answers, restored on failure, writeError);
      hooks (cache updated immediately, server failures → writeError not form error,
      part-way split failure); settle-all undoes only refused payments; screens
      navigate back immediately; banner shows/dismisses/auto-hides.

**Checkpoint 4:** edits, deletes, close/reopen and payments show instantly; in
airplane mode they snap back with the red banner. ☐

## Phase 5 — Supabase Realtime

- [x] `supabase/migrations/046_realtime_publication.sql` — adds `trips`,
      `trip_members`, `expenses`, `groups`, `group_members`, `split_requests`,
      `recurring_expenses` to `supabase_realtime` (idempotent). `splits` left out:
      no trip/group id on the row, and every split write comes with a write to its
      parent expense. **Written, not pushed — production change, needs your OK.**
- [x] `IRealtimeService` + `REALTIME` token; `SupabaseRealtimeService` (one channel,
      one `postgres_changes` listener per table; RLS scopes INSERT/UPDATE);
      `MockRealtimeService` with `emit()` for tests and simulation.
- [x] `bucketsForChange()` (pure, `src/core/logic/remoteChanges.ts`) maps a row
      change to buckets. DELETE events only carry the primary key, so their bucket
      is recovered from the cache; a deleted row this device never had is ignored.
- [x] Store `notifyRemoteChange(bucket)`: ignores never-loaded buckets; debounces
      (500 ms) so a burst = one refetch; holds the refetch while one of this
      device's own save-first writes to that bucket is in flight, then refetches
      when it ends (a mid-write refetch could read an expense with half its splits).
- [x] `useRealtimeSync` in AuthGate: subscribed only while signed in and in the
      foreground; closed in the background (foreground revalidation covers the gap).
- Own-write echoes are not filtered: rows carry no "who wrote this", and the
      resulting refetch is harmless (it returns what was just saved).
- [x] Tests: mapping per table incl. deletes; store ignore/debounce/hold-during-write;
      hook subscribe/unsubscribe lifecycle and end-to-end insert → refetched cache.

**Checkpoint 5:** two devices on the same trip see each other's changes live. ☐

## Phase 6 — Push-notification refresh

- [x] Investigated: the only push sent today is "group expense added"
      (`useCreateGroupExpense`), and the Edge Function forwarded only `eventType` —
      no ids, and the app had no notification listeners at all.
- [x] Sender now puts `groupId` in the payload; `send-queued-notification` forwards
      `tripId`/`groupId` in the push `data`. **Edge Function changed, not deployed —
      needs your OK.** (No test harness exists for Edge Functions; 3-line change.)
- [x] `usePushRefresh` (in AuthGate, signed-in only): on a notification received in
      the foreground or tapped, `bucketsForNotification()` → `notifyRemoteChange`
      (same debounce / in-flight rules as Realtime). Pushes from the old server
      without ids are simply ignored.
- [x] Tests: id → bucket mapping; foreground notification refreshes the group;
      tap refreshes; listeners removed on unmount; sender includes `groupId`.
- Note: a tap still doesn't navigate anywhere — that was never built and is out of
  scope here.

**Checkpoint 6:** with the app closed, a member adds a group expense; opening the
notification shows it without pulling to refresh. ☐

## Deferred

Moved to `docs/sync-followups-todo.md` with the follow-ups found during the build.

## Verification per change

`tsc --noEmit` diffed against the pre-existing baseline, the touched test files,
full `npx jest`, `npm run lint` filtered to repo paths.
