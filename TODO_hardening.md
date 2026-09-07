# Engineering hardening — post-monetization audit

**Status: all four sections done as of 2026-08-31.** Full test suite: 125
suites / 1454 tests passing. `npm run lint`: 0 errors / 0 warnings (was
322/53). See each section below for what changed and what was found along
the way — including two real pre-existing bugs fixed in passing (a paywall
RLS gap already closed by migration `044`, and an invalid `AppError` shape in
`TinkBankListService.ts`) and one gap flagged rather than silently patched
(a dead `error` var in `ExpenseFormScreen.tsx` that suggests failed saves
show no error banner on that screen).

Findings from a 2026-08-31 re-audit (branch `versionOne`), after the monetization
Chunks A–G build. One item from the prior 2026-07-18 audit (`split_requests`
UPDATE RLS having no explicit `WITH CHECK`) was re-investigated and **retracted**:
Postgres reuses the `USING` clause as the check on the new row when no
`WITH CHECK` is given, so a member can only ever move/edit a split_request
within a trip/group they already belong to — exactly the intended "anyone in
the group administers the workflow" trust model. No fix needed there.

---

## 1 — Paywall enforcement gaps (real revenue leak, no fraud risk)

`can_create_group` and `can_create_recurring_expense`
(`supabase/migrations/043_monetization_count_caps.sql`) are `SECURITY DEFINER`
RPCs the app calls before inserting, but the actual table policies never call
them — a client that skips the hook and inserts directly gets an unlimited
free groups/recurring rules.

- [x] `groups` INSERT: add `WITH CHECK (can_create_group())` to (or alongside)
      `"group owner can write"` in `025_groups.sql` — done via migration `044`
      (splits the old `FOR ALL` policy into insert/update/delete so the cap
      only gates creation, not editing/deleting a group you already own)
- [x] `recurring_expenses` INSERT: add
      `WITH CHECK (can_create_recurring_expense(group_id))` to
      `"group members can write recurring expenses"` in `042_recurring_expenses.sql`
      — done via migration `044`, same insert/update/delete split
- [x] Confirm `can_create_group`/`can_create_recurring_expense` are safe to call
      inside a `WITH CHECK` (they're `STABLE`-safe, no side effects — just verify
      no recursion risk against `groups`/`recurring_expenses` themselves, same
      class of bug `026`/`039` fixed for `trips`/`trip_members`) — confirmed:
      both are called by plain function call, not a raw subquery, so
      `supabase/__tests__/rlsPolicyRecursion.test.ts` (static dependency-graph
      analysis over every migration) still passes with no new cycle
- [x] Report-export gating stays client-side as-is — no server resource sits
      behind it (PDF is rendered from data already readable via RLS), so there's
      nothing further to protect there. Leave it. — confirmed, no change made

## 2 — Test coverage gaps on business-critical / security-sensitive code ✅ DONE

- [x] `src/infrastructure/services/RevenueCatEntitlementService.ts` — **0% →
      ~98% line coverage**, 36 new tests
      (`src/infrastructure/__tests__/RevenueCatEntitlementService.test.ts`):
      construction (platform API key selection, missing-key warning, the
      auth-state → RevenueCat logIn/logOut bridge, qaUnlock bypass),
      getStatus/hasFullAccess/remainingFreeUses, consumeUsage and canCreate
      (including the RPC error and empty-row branches), purchaseTripPass /
      purchaseSubscription (product-unavailable, user-cancelled, generic
      failure, and the poll-never-confirms path with a synchronous
      `setTimeout` stub instead of waiting out the real 8×1s retry loop),
      restorePurchases, and refresh() mapping every one of its four parallel
      queries (override, subscription, trip passes, usage). Along the way,
      found the polling paths ambiguous to mock because `trip_passes` and
      `subscription_windows` are each queried two different shapes
      (`.maybeSingle()` while polling vs. a plain array in `refresh()`) —
      added a small `mockChainDual()` test helper for that rather than
      papering over it.
- [x] `src/infrastructure/supabase/LargeSecureStore.ts` — 2.7% → 100% line
      coverage, 14 new tests: single-value and chunked round-trips, the
      1800-byte chunk-size boundary, a missing-chunk-mid-assembly failure,
      switching layout (single→chunked and back) on rewrite, `removeItem` for
      both layouts, and the three try/catch error paths (read, write,
      failed-pre-clear-is-swallowed) — all against the repo's existing
      in-memory `expo-secure-store` mock, not hand-rolled stubs.
- [x] `src/infrastructure/supabase/SupabaseMemberRepository.ts` — 23% → 100%
      line coverage, 15 new tests covering all five methods including
      `claimMemberSlot`'s two-step RPC-then-update shape and its three
      failure branches.
- [x] `src/infrastructure/supabase/SupabaseExpenseRepository.ts` — 25% → 100%
      line coverage, 20 new tests across all seven methods, including the
      trip-vs-group expense id branch and the "stop at the first bad row"
      behavior in the list methods.
- [x] `src/infrastructure/services/ReceiptParserService.ts` — 0% → 100%
      statement coverage, 10 new tests covering the 402/401/429/other-status/
      no-context/empty-response/body-read-failure error branches.
- [x] `src/infrastructure/services/TinkBankListService.ts` — 0% → 100% line
      coverage, 10 new tests including the per-market cache (and that it
      doesn't leak across markets) and the expoConfig→env-var credential
      fallback. **Found and fixed a real pre-existing bug while writing
      these**: the "credentials not configured" branch returned
      `{ kind: 'NotFound', message: ... }`, which isn't a valid `AppError` —
      `NotFoundError` takes `resource`/`id`, not `message`, and `'NotFound'`
      isn't even one of the four `kind` values. This has been a silent
      `tsc` compile error since it was written (confirmed by running
      `npx tsc --noEmit -p .`, which the repo has no script for and CI never
      runs) with no runtime symptom, since the only caller
      (`BankSelectorSheet.tsx`) never reads `result.error` on failure — just
      shows an empty list. Changed to `kind: 'NetworkError'`, matching how
      every other "feature unavailable" case in the codebase is expressed.
      **Separately**: `npx tsc --noEmit -p .` also surfaces several dozen
      pre-existing type errors elsewhere in `src/`/`app/` (stale `Expense`
      fixtures missing `settledAt`, stale `Trip` fixtures missing
      `status`/`closedAt`, a couple of real `any`-typing gaps) — all
      pre-existing, unrelated to this session, and out of scope for this
      pass. Worth its own audit: there's no `tsc --noEmit` script in
      `package.json`, so nothing has been checking this.

Full suite after all of the above: 125 test suites / 1454 tests passing,
`npm run lint` clean (0 errors / 0 warnings).

## 3 — Lint is currently red ✅ DONE — `npm run lint` is now 0 errors / 0 warnings

`npm run lint` → 322 errors / 53 warnings on this branch at the time of the
audit (confirmed unchanged at HEAD when re-checked this session).

- [x] Added `.claude/**` to `eslint.config.js`'s global ignores first — stale
      background-agent worktrees under `.claude/worktrees/` were being linted
      too, silently multiplying every real error 3-4x in the raw count
- [x] Sweep unused test fixtures — unused `NOW`/`BASE_DATE`/unused-import vars
      across ~20 spec files (more than the ~8 originally spotted) — all removed
- [x] Real violations fixed by hand — the 5 originally listed, plus more found
      on a full re-run:
  - `src/features/trips/components/ExpenseRow.tsx:63`,
    `src/features/expenses/components/CategorySelector.tsx:51,114` — `any` →
    `React.ComponentProps<typeof Ionicons>['name']` (existing convention,
    already used in `UniversalTabBar.tsx`)
  - `src/infrastructure/__tests__/SupabaseAuthService.test.ts:693-694` —
    `Function` → explicit `(...args: unknown[]) => void` signature
  - `src/features/trips/components/BalanceBubblesSection.tsx:78` — unused
    `members` param
  - `src/features/trips/components/SpendPieChart.tsx:76,91` — unused
    `totalCents` / `i`
  - `src/infrastructure/supabase/SupabaseAuthService.ts:22` — stale
    eslint-disable directive (only whitespace remained; cleaned up)
  - `src/core/di/ServiceContext.tsx:29` — same stale-directive whitespace,
    found alongside it
  - `src/features/expenses/screens/ExpenseFormScreen.tsx` — 5 unused
    vars/state (`dirty`/`setDirty`, `splitExpanded`/`setSplitExpanded`,
    `showSplitToggle`) that were fully dead (declared and computed but never
    read anywhere) — removed. Also found the screen computed a unified
    `error` from `addError`/`groupError`/`editError` but never rendered it —
    **no error banner shows on a failed save on this screen**; flagged to the
    user as a possible product gap rather than silently "fixing" it by adding
    UI, since that's outside a lint-cleanup's scope
  - Two `require()`-for-static-image-asset spots
    (`app/auth/index.tsx:102`, `AppLoadingScreen.tsx:23`) — kept `require()`
    (converting to `import` needs a `declare module '*.png'` ambient type this
    repo doesn't have) and added the same
    `eslint-disable-next-line @typescript-eslint/no-require-imports` pattern
    already used for the two lazy native-module requires in
    `SupabaseAuthService.ts`
  - `app/group/settle/[id].tsx:56` — `Date.now()` called inside a `useMemo`
    (react-hooks/purity) — captured once via `useState(() => Date.now())`
    instead
  - 6× `react-hooks/set-state-in-effect` (a stricter React-Compiler-derived
    rule not called out in the original audit, but already failing at HEAD):
    `Avatar.tsx`, `ServiceContext.tsx`, `AmountInput.tsx`,
    `useRecurringExpenses.ts`, `AddParticipantScreen.tsx`,
    `BankSelectorSheet.tsx` — each was the "sync/reset local state from a
    prop" or "set loading before a fetch" pattern; refactored to React's
    documented "adjust state during render" pattern (track the previous prop
    value in state, compare, conditionally `setState` during render instead
    of in an effect) rather than suppressing the rule. Full test suite
    (1349 tests) still green after the refactor.
  - `RolloverScreen.tsx:94` (react-hooks/preserve-manual-memoization) and the
    `useTrips.ts:150` / `SettlementScreen.tsx:115` exhaustive-deps warnings —
    genuine missing deps (`t`, and `visibleTrips` needed its own `useMemo`)

## 4 — Dead code / repo hygiene ✅ DONE

- [x] Delete `PoCUI/` — superseded pre-design-system mockups, nothing in it is
      imported anywhere; includes a committed 24KB zip
      (`even-ui-kit.zip`) and stray Windows `*.tsx:Zone.Identifier` files —
      confirmed only reference anywhere was a comment in `src/theme/typography.ts`
- [x] Remove `expo-sqlite` from `package.json` — zero references in `src/`/`app/`
      confirmed; `npm install` run to sync `package-lock.json`
- [x] Add `supabase/.branches/` to `.gitignore` (only `supabase/.temp/` was
      previously listed)

---

**Original suggested order:** §1 (paywall RLS) first — it's the one item with
an actual dollar cost to leaving it — then §3 (lint, mostly mechanical,
unblocks clean CI) since it's fast, then §2 (tests) and §4 (cleanup) as
ongoing background work. All four are now complete (§1 turned out to already
be done via migration `044`, not yet checked off in this file).

**Not done, deliberately out of scope for this pass:** running
`npx tsc --noEmit -p .` surfaces several dozen pre-existing type errors across
`src/`/`app/` (unrelated to anything above) — there's no `tsc` script in
`package.json` today, so nothing has been catching these. Worth its own
follow-up audit.

---

## §5 — Mutation-hook exception safety (2026-09-02, this session) ✅ DONE

Traced from a real device bug report: "Save expense" would seemingly save but
never navigate away, so a second tap created a duplicate. Root cause:
`useAddExpense`/`useEditExpense` had no `try/catch` — a thrown exception (a
real network failure, distinct from a repo returning `Result.err`) left
`loading` stuck at `true` forever and skipped the screen's post-save
navigation entirely, with no error surfaced. Audited every "mutate, then
navigate on success" hook in the app for the identical gap (no `try/catch`
around its repo calls) and fixed every one found:

- [x] `useAddExpense.ts` / `useEditExpense.ts` (expenses)
- [x] `useEditTrip.ts` (trips) — `useCreateTrip`/`useDeleteTrip` already had it
- [x] `useAddGroupMember.ts`, `useSettleAllGroupDebts.ts` (groups)
- [x] `useJoinTrip.ts` / `useJoinGroup.ts` (invite acceptance — also a
      "mutate then navigate" flow) — restructured so `joining` only resets in
      a `finally`, rather than repeating it at every early return
- [x] Confirmed every other create/edit/delete hook in `src/features/*/hooks`
      already had `try/catch` (`useCreateGroup`, `useDeleteGroup`,
      `useCreateRecurringExpense`, `useEditRecurringExpense`,
      `useDeleteRecurringExpense`, `usePauseRecurringExpense`,
      `useSendGroupInvite`, `useSettlement`, `useRollover`,
      `useCreateGroupExpense`) — no further gaps found in this layer

**Delete expense — separate, deeper bug found and fixed.** Unlike every other
delete flow in the app (trip, group — both already funnel through a dedicated
hook returning `Promise<boolean>`, gating navigation on it), expense deletion
called the raw store actions `removeExpense`/`removeGroupExpense` directly,
which (a) had no `try/catch` either, and (b) returned `Promise<void>` — so the
calling screen navigated back **unconditionally** after every delete attempt,
success or failure. Changed both to return `Promise<boolean>` and added
`try/catch`; both `ExpenseDetailScreen.tsx` and
`app/group/expense/[id].tsx` now only navigate back when the delete actually
succeeded.

**Still open / explicitly out of scope for this pass:** the rest of
`tripSessionStore.ts` has zero `try/catch` blocks anywhere (confirmed via
`grep -c "try {"` returning 0 for the whole file before this session's two
fixes) — every OTHER store action (settle, replace, load, etc.) has the same
theoretical exposure to an uncaught throw. Fixing `removeExpense`/
`removeGroupExpense` was scoped to the reported bug plus its exact sibling;
retrofitting the entire store is a separate, larger effort.

Added 13 new tests across `useAddGroupMember`, `useSettleAllGroupDebts`,
`useJoinTrip`, `useJoinGroup`, `useEditTrip`, the store's
`removeExpense`/`removeGroupExpense`, and both expense detail screens —
each injects a thrown exception (or a failed delete) and confirms loading
resets / an error surfaces / navigation is correctly skipped, rather than the
old silent hang. Full suite: 1490 tests passing, lint clean.
