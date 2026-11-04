# Release tests todo

> **Status (2026-11-03).** Phases A–D built; Phase E survey done with the
> high-priority items implemented. `npm test` green apart from a pre-existing
> timing flake (see Follow-ups); `npm run test:release` green: 57 tests, 6 files;
> `it.failing` tests document the remaining known bugs. **Not pushed:** 051 (invite links), 052 (link expiry) and migrations 049
> (grants, no-op in prod) and 050 (reset_user_data security fix) need your OK.
> **Decisions needed:** see "Findings needing a decision". No checkpoint ticked.
> Triggered by two production bugs the unit tests could not see (047, 048).

## Goal

1. **Static schema checks** (fast, part of `npm test`): replay the migration
   files and fail on known bug shapes.
2. **Release test category** (`npm run test:release`): start a local Supabase
   stack in Docker, apply every migration to a fresh database, and run the real
   `Supabase*` repositories against it as real signed-in users.
3. **Gap list**: tests that only make sense against a real database and are
   missing from the everyday suite today.

## Phase A — Static schema checks

- [x] Rule: a `*user_id` column that is `uuid` must have a foreign key to
      `users`/`auth.users`. A uuid user id with no FK is a member id that can
      hold a guest placeholder, so it must be `text`. (Would have caught 048.)
- [x] Rule: on a table with nullable `trip_id` plus `group_id`, every command that
      has a trip-scoped policy must also have a group-aware one. (Would have caught 047.)
      Limitation: child tables keyed through a parent (e.g. `splits` via
      `expense_id`) aren't covered — the release tests cover those.
- [x] Prove each rule fails on the migrations as they stood before 047/048:
      `replayMigrations('046'|'047')` in `supabase/__tests__/schemaRules.test.ts`.
- [x] Shared replay code moved to `supabase/__tests__/migrationReplay.ts` (now also
      tracks tables/columns/FKs); `rlsPolicyRecursion.test.ts` uses it.
- [x] Full suite green (146 suites, 1651 tests), lint clean.
- [ ] ☐ **Checkpoint A** — your review.

## Phase B — Local Supabase stack

- [x] `supabase init` → `supabase/config.toml`. Analytics and Edge Runtime
      containers disabled (unused so far). Supabase CLI added as a devDependency
      (2.109.1) so the tests don't depend on a globally installed binary.
- [x] All 48 migrations replay cleanly on an empty database.
- [x] `supabase db diff --linked --schema public`: **no drift** — production
      matches the migration files.
- [x] Found: Supabase no longer grants the API roles access to new public tables
      (opt-out removed 2026-10-30). Production's existing tables keep their grants;
      a fresh database had none ("permission denied for table users"). Added
      `049_explicit_api_grants.sql` (no-op in prod) and a static rule that every
      table created after 049 is granted in its own migration. **Any future table
      in production needs its GRANT, or the app can't reach it.**
- [ ] ☐ **Checkpoint B** — your review.

## Phase C — Release test harness

- [x] `jest.release.config.js`: unit config + `release/**/*.release.test.ts`,
      serial, `forceExit` (supabase-js timers). Release-only Babel plugin turns
      `import()` into `require()` so the real `createProductionContainer()` runs;
      `react-native-purchases` stubbed (entitlements are read from the DB anyway).
- [x] `release/setup/globalSetup.js`: starts the stack if needed, `db reset`
      (skip with `RELEASE_SKIP_RESET=1`), waits for PostgREST + GoTrue, writes
      local URL/keys. `loadEnv.js` refuses any non-localhost URL.
- [x] `release/support.ts`: users created through the app's own
      `SupabaseAuthService.signUp`; `signInAs` switches the app's session and
      resets the store; `renderAppHook` renders hooks inside the production
      container; service-role `admin` client for assertions.
- [x] `npm run test:release`; `npm test` unchanged and Docker-free.
      Logs quiet unless `RELEASE_VERBOSE=1`.
- [ ] ☐ **Checkpoint C** — your review.

## Phase D — Common flows against the real database

- [x] `groupExpenses` — group + guest + expenses paid by/split with the guest,
      read-back, activity events, outsider refused. **Proven:** with 047/048 removed
      it fails with exactly the two errors seen on the phone.
- [x] `tripExpenses` — create trip, add members, add/edit/delete expense through
      the store's save-first actions, payer/owner/member edit rules, outsider refused.
- [x] `groups` — free-tier group cap (app check and RLS), membership, recurring
      expense cap, group history feed via `useGroupActivityFeed`, split requests.
- [x] `guestClaim` — guest added by email becomes the real account on sign-up;
      membership, expenses and splits move over (works since 048).
- [x] `accountReset` — `reset_user_data` security + function (see findings).
- [ ] ☐ **Checkpoint D** — your review.

## Phase E — Gap exploration

- [x] Survey done — list below. High-priority items marked ✅ are implemented.
- [ ] ☐ **Checkpoint E** — your review.

## Findings needing a decision

Each is pinned by an `it.failing` test that flips to a failure once fixed
(then change it to `it()`).

1. ✅ **Invite links — fixed in 051 (not pushed).** Decision: token alone is
   enough to join. `preview_*_invite(token)` (id + name only, open to anon) and
   `join_*_by_invite(token, name, avatar)` (signed-in; idempotent; claims an
   email-matched placeholder) replace direct table reads. Self-insert into
   `trip_members`/`group_members` removed (owner-only). The database now
   generates all tokens (the app's `Math.random` tokens are gone; groups no
   longer get base64 tokens with `+`/`/`). The new tests also found and 051
   fixes: `claim_member_slot` (uuid = text) and the trip loop of
   `merge_guest_records_for_new_user` — trip guests were never claimed.
   Tests: `release/flows/inviteLinks.release.test.ts`, trip case in `guestClaim`.
   **Follow-up, 052 (not pushed): link expiry.** Owner picks 24h / 7 days /
   30 days / never (trips default 7 days, groups never); owner can reset the
   link (new token, clock restarts); a closed trip's link stops working.
   Existing members and email-matched guests still get through an expired link.
   Expired joins fail with WS410 (→ ValidationError on `inviteToken`).
2. **A payer can't change who paid.** The expenses UPDATE policy has no WITH CHECK,
   so "paid_by = me" is also applied to the edited row; only the trip owner can
   reassign. If that should be allowed, note the splits DELETE policy checks the
   *new* payer, so the store's edit would then leave stale splits (the test checks
   for that too).
3. **Deleting an expense erases its history.** `activity_events.expense_id` is
   ON DELETE CASCADE: the expense's created/edited events are deleted with it and
   the `expense.deleted` event fails its foreign key (silently — it's
   fire-and-forget). Likely fix: drop that FK (keep the id as a plain column).
4. **`reset_user_data`** — fixed in 050 (was broken by a text = uuid compare, and
   an anonymous caller would have bypassed the ownership check once that was
   fixed). Nothing calls it; alternative is to drop it.

## Gap list

What the unit tests mock away that only a real database can show. ✅ = done.

High
- ✅ RLS on expenses/splits for trips and groups, incl. guests (047/048)
- ✅ Paywall caps enforced in RLS (groups, recurring)
- ✅ Guest → account merge RPCs
- ✅ `reset_user_data` permission check
- ☐ `users` row: a client can't set `full_access_override` or edit another user
- ✅ `trip_members` / `group_members` self-insert loophole (051)
- ✅ Invite join for trips/groups incl. email-matched claim (051)
- ☐ OCR / report usage caps: `increment_usage_if_allowed`, `check_report_rate_limit`
- ☐ Delete trip / group: only owner; cascades clean up members, expenses, splits
- ☐ Notifications: `expense_added` rows enqueued for every member but the payer;
  split-request status trigger enqueues its notification

Medium
- ☐ Realtime: another member's insert reaches `SupabaseRealtimeService` (046 publication + RLS)
- ☐ Receipt upload to storage + storage policies
- ☐ Store hydration / revalidation against real repos (cold start, caching)

Larger / later
- ☐ Edge Functions (stripe-webhook, ob-webhook, revenuecat-webhook,
  send-queued-notification, parse-receipt) in the local edge runtime with stubbed
  external APIs — overlaps `TODO_release.md` §12
- ☐ On-device E2E (Maestro/Detox) — separate effort

## Follow-ups

- `ExpenseFormScreen.test.tsx` currency tests time out (1 s `waitFor`) in the full
  unit run when the machine is loaded (e.g. Docker running); pass on their own.
  Pre-existing; unrelated to this work.
- Once decisions 1–3 are made, flip the matching `it.failing` tests to `it()`.
