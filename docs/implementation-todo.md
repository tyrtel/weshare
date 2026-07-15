# Implementation todo

> **Updated (2026-07-13).** Phase 2 done and signed off. Phase 3 is in progress:
> 3a landed (currency picker, trip detail on shared `Avatar`, member-avatar-row
> unified to trip's design via `ParticipantsRow`; balance/stat card spun out
> into Phase 4, see below). 3b landed (`HeaderConfirmButton`/`LabeledTextInput`
> extracted, `EditTripScreen`'s currency picker migrated onto the shared
> `CurrencyPicker`). 3c now also landed — Add-member unified
> (`AddMemberNameField`, `ContactsPickerList`, `CurrentMembersList`
> extracted; `app/group/add-member.tsx` rewired onto `useAddGroupMember`;
> "frequent people"/invite-link stayed trip-only, flagged as a product
> default not a silent decision) — but 3c also surfaced and fixed a real,
> unrelated, pre-existing bug along the way: `bg={x.text}` passed to `Avatar`
> in 13 places across 10 files rendered invisible white-on-white initials
> everywhere from trip expense rows to settlement rows. User chose to fix it
> everywhere rather than scope it down; done, verified, full detail in the 3c
> entry below.
> 3d landed — `DetailHeaderBar`, `DetailExpenseRow`, and `balanceView.ts`
> extracted from the genuinely-identical pieces of `TripDetailScreen`/
> `app/group/[id].tsx`; the balances/stat card, body layout, and FAB stayed
> deliberately un-unified (real divergences, the balances card overlaps
> Phase 4's territory specifically).
> **3e now also landed — all of Phase 3 (3a–3e) is done.** Expense detail
> unified: `ExpensePaidByCard` and `ExpenseReceiptSection` extracted;
> receipts backported to group's expense detail (user's explicit choice —
> edit-action and per-expense-settle stayed scoped as they are today); found
> and fixed a real bug along the way (group's "Paid by" avatar was hardcoded
> to always the same color, `personColors[0]`, regardless of who paid).
> Full detail in the 3e entry below.
> **Phase 4 was substantially revised on 2026-07-14**, after a design
> discussion during your manual-testing pass: instead of per-expense
> invoice-style debt with an oldest-first payment allocation, it's now a
> running ledger per pair — overpayment just becomes a credit that carries
> forward, and per-expense "settled" badges (including the one just added to
> `ExpenseDetailScreen` in 3e) get replaced by one shared ledger/
> transaction-history view, for **both trip and group** (confirmed
> explicitly — the balance calculation is shared code). Full reasoning in
> `group-ongoing-settlement-analysis.md`'s "Revised" note at the top. Still
> **nothing in Phase 4 has been built** — this was a planning pivot, not
> implementation; it's written up for review, not started.
> Nothing is mid-edit — the working tree is clean, typechecked, and full suite
> green and stable across repeated runs (999/999) as of the last change.
> **Phase 4's 4a–4e were expanded into a granular, file-precise coding
> checklist on 2026-07-14**, at your request, ahead of starting the build.
> Tracing the actual codebase while writing it surfaced two things the
> conceptual sketch hadn't named: the store's `splitRequests` slice is keyed
> strictly by `tripId` today and needs its own plumbing work to support
> group scope (not just relaxing the model field), and
> `app/group/expense/[id].tsx`'s "Mark as settled" button is a *third*
> dead-end this change creates (alongside trip's dead "Mark Paid" and the
> split badges already slated for retirement), since it currently only
> "works" via the exact exclusion filter 4c removes. Both are now explicit
> checklist items rather than surprises for mid-build.
> **4a landed (2026-07-14).** The ledger's write side and the calculation
> change are both in: `SplitRequest` relaxed to trip-or-group-scoped, a
> parallel `groupSplitRequests` store slice added (mirroring the existing
> `expenses`/`groupExpenses` pattern rather than a new composite key),
> `computeMemberNetBalances`/`calculateSettlements` now take a
> `LedgerPayment[]` credit side and no longer read `Split.amountPaidCents`/
> `settledAt` at all, and every live call site (`useSettlement`,
> `TripDetailScreen`, `computeGroupBalances` + its caller `useGroupDetail`)
> is wired up. **Concrete, working proof, not just the calculation in
> isolation:** trip's "Mark Paid" button — dead since before this session
> started — now actually reduces the displayed balance, verified end-to-end
> through `useSettlement` and `TripDetailScreen`'s rendered "YOUR NET" stat,
> not just the pure function. Two dead-code components
> (`BalanceBubblesSection`/`TripListHeader`) found and explicitly flagged
> rather than silently touched or silently ignored. Full detail, including
> where this deviated from the original sketch and why, in the 4a entry
> below. A currency-conversion bug (unrelated to Phase 4) was also found and
> fixed during your manual-testing pass for Checkpoint 3 — see the note just
> above the Checkpoint 3 entry.
> **Checkpoint 3 signed off 2026-07-15.**
> **4b now also landed (2026-07-15)** — the shared ledger/transaction-history
> view, the "record a payment" primitive deferred from 4a, and the old
> `markDebtPaid`/`markDebtOwed`/`markSettled` UI actions retired in favor of
> it. Full detail in the 4b entry below. Nothing is mid-edit — working tree
> typechecked, full suite green and stable across repeated runs (1009/1009).
> **4c now also landed (2026-07-15)**, after you reviewed a rundown of the
> options and made four explicit decisions: closing a trip is purely
> organizational (Decision 1); the group's per-expense "Mark as settled"
> button is retired entirely, not repurposed (Decision 2); trip closing is
> now reversible via a new "Reopen Trip" link (Decision 3); and closed trips
> are discoverable from the group screen behind a "View past items" toggle
> (Decision 4). Retiring Decision 2's button required also reconciling the
> group's bulk "Settle everything" action (4e) in the same pass — it would
> otherwise have kept doing something that no longer meant anything — so 4e
> landed alongside 4c rather than as a separate later step. Full detail in
> the 4c entry below. Nothing is mid-edit — working tree typechecked, full
> suite green and stable across repeated runs (1001/1001).
> **4d now also landed (2026-07-15) — Phase 4 is complete.** The group settle
> screen's suggested transfers are now tappable into the same shared ledger
> view trip uses (`AuditDetailScreen`, generalized to accept either a
> `tripId` or a `groupId`) and gained a "Record" action wired to the same
> `RecordPaymentSheet`, via a new `useGroupLedgerHistory` hook and a
> `recordPayment` primitive added to `useGroupDetail`. Full detail in the 4d
> entry below. **Checkpoint 4 is signed off — Phase 4 (4a–4e) is done.**
> Nothing is mid-edit — working tree typechecked, full suite green and
> stable across repeated runs (1011/1011).

Working sequence agreed 2026-07-13, now four phases (Phase 4 added mid-stream once
the balance/stat card question in 3a turned into a real feature ask) — each has a
checkpoint at the end where progress gets reviewed before moving to the next. Check
items off as they land; each phase's checkpoint gets marked once everything above it
is done and reviewed.

Full detail lives in companion docs, referenced inline rather than repeated here:
- Test plan (63 cases across 23 screens, with a live checklist):
  the artifact published earlier in this conversation.
- Unification analysis (per-pair overlap, effort sizing, why Settle is excluded):
  [`docs/trip-group-unification-analysis.md`](./trip-group-unification-analysis.md)
- Ongoing settlement analysis (grounds Phase 4 — what's actually broken today,
  what already works, what needs building):
  [`docs/group-ongoing-settlement-analysis.md`](./group-ongoing-settlement-analysis.md)

---

## Quick list

- [x] **Phase 1** — fix the two bugs found during the unification analysis
- [x] **Checkpoint 1** — review
- [x] **Phase 2** — component test plan
- [x] **Checkpoint 2** — review
- [x] **Phase 3** — duplicate screen unification
- [x] **Checkpoint 3** — review
- [x] **Phase 4** — ongoing settlement ledger (trip + group)
- [x] **Checkpoint 4** — review

---

## Phase 1 — Bug fixes

Both were found as side effects of the unification analysis, not the test plan — small,
independent, safe to land immediately.

- [x] **`EditTripScreen` has its own hardcoded, duplicated currency list.** Fixed —
      deleted the local `CURRENCIES`/`currencyLabel()` copy in
      `EditTripScreen.tsx`, imported the shared ones from `core/constants/currencies`
      instead. Drop-in: the shared `CurrencyDef` shape (`code`/`symbol`/`name`) is a
      superset of what the local copy had, so nothing else in the file changed.
- [x] **`EditGroupScreen` is missing the currency-migration cascade `EditTripScreen`
      has.** Fixed — `useEditGroup` now mirrors `useEditTrip`'s cascade: on a currency
      change it walks the group's own expenses still in the old currency and updates
      each via `EXPENSE_REPO`. Needed one supporting addition: there was no store
      mutator to replace a single group expense by id (the trip side already had
      `replaceExpense`), so added `replaceGroupExpense` to `ITripSessionStore` /
      `tripSessionStore.ts`, mirroring `replaceExpense`'s exact pattern.

### Checkpoint 1

- [x] Both fixes landed, typechecked, full test suite green (929/929)
- [x] Reviewed together — nothing else surfaced beyond the two known bugs
- [x] Mark this checkpoint `[x]` before starting Phase 2

**Signed off.** Phase 2 starting.

---

## Phase 2 — Component test plan

Six sub-phases, matching the priority tiers from the test-plan artifact. Do them in
order — Phase 0 is genuinely a prerequisite (every later phase reuses it), and
`ExpenseFormScreen` is P0 because it's where every regression from this session
actually lived.

- [x] **2a — Shared test infra.** Done —
      [`src/__testUtils__/renderScreen.tsx`](../src/__testUtils__/renderScreen.tsx)
      (replaces the hand-rolled `makeWrapper()` every screen test repeated) and
      [`src/__testUtils__/standardMocks.ts`](../src/__testUtils__/standardMocks.ts)
      (shared router/icons/safe-area/svg mock factories — includes a `useFocusEffect`
      shim, needed by `useTripDetail`/`useExpenseDetail`). Validated by retrofitting
      `TripDetailScreen.test.tsx` to use both — still 4/4 green. Added `testID`s to
      all 5 inputs on `ExpenseFormScreen` (main amount, description, per-person exact
      amount, item description, item amount) plus the item-remove button, replacing
      placeholder-text matching, which was ambiguous (see 2b).
- [x] **2b — `ExpenseFormScreen`.** Done — 20 cases covering amount sanitization, the
      double-conversion regression (asserts saved splits stay balanced and close in
      value, not near-zero-plus-dumped-remainder), the exact-mode and itemized-mode
      focus-loss regression, live "Unassigned" in both modes (including going
      negative), the Shares-tab-removed guard, Evenly-mode member toggling, group-mode
      save routing to the group bucket, edit-mode currency reconstruction (original
      entry currency, not trip currency), and Paid-by collision-disambiguation labels.
      **Found a real bug while writing the last one**: `initialCollisionLabels`'s loop
      started at `n = 2`, so it always escalated to at least a 2-word label even when
      the first name alone already disambiguated (e.g. "Alice" vs "Aaron" rendered as
      "Alice Smith" vs "Aaron Lee" instead of just "Alice"/"Aaron"). Fixed — loop now
      starts at `n = 1`. Also caught a test-writing mistake of my own before it became
      a false-positive: `getAllByPlaceholderText('0.00')` matches the itemized item's
      amount field AND the screen's main amount field (same placeholder) — the
      `testID`s from the infra step above are what make the itemized tests
      unambiguous.
- [x] **2c — `ExpenseDetailScreen`.** Done — 4 cases added to the existing test file:
      conversion caption renders when `metadata.originalAmount` is present, is absent
      entirely otherwise, appends "· approx." only for `source: 'approximate'`, and no
      redundant currency-code badge next to the total. Computed expected strings via
      the real `formatCurrency`/`formatRate` functions rather than hardcoding Intl
      output, so the assertions aren't locale-fragile. All passed on the first run.
- [x] **2d — P1 financial screens.** Done — 19 cases across 5 new test files, all
      passing:
      - `GroupExpenseDetailScreen` (5) — render, settle button visible/hidden by
        `settledAt`, settle action (real repo round-trip via `Alert.alert` mock),
        "Make recurring" opens the sheet.
      - `BalanceSummaryScreen` (4) — owed/owe/settled states with real net-balance
        math, empty state. Caught my own setup mistake before it became a false
        pass: `MockAuthService.signIn` derives the user id as `user_<email>`, not
        the email itself — a hardcoded `'me'` silently matched nothing until fixed
        to read the real id off the sign-in result.
      - `GroupDetailScreen` (4) — render, all-settled vs. settle-up states, expense
        row navigation. **Found and fixed a real, currently-shipping bug while
        writing the first case**: the screen read `expense.amountCents`, a field
        that doesn't exist on `Expense` (`totalAmountCents` is the real name) —
        every group expense amount was rendering `NaN` in production. One-line fix
        in `app/group/[id].tsx`; the test now pins the correct behavior and
        explicitly asserts no `NaN` renders.
      - Group Settle (3) — suggested-transfer rendering, "Mark everything settled"
        (real repo round-trip), all-settled state.
      - `AuditDetailScreen` (3) — entries render with amount/method/date, empty
        state, error state.

      **Flagged during 2d, fixed as a follow-up:** `app/group/[id].tsx` called
      `useBalanceView()` *after* an early `if (!group) return null;` — a genuine
      Rules-of-Hooks violation, pre-existing (confirmed via `git stash`, predates
      this session). Crashes React with "Rendered fewer hooks than expected"
      whenever the same mounted screen transitions between `group` falsy → truthy
      (e.g. a cold load, where the store hasn't hydrated on the first render) or
      truthy → falsy (the group gets deleted while the screen is open). **Fixed** —
      hoisted the hook above the early return, next to the screen's other
      unconditional hooks; nothing below the guard needed to move since only hook
      calls (not plain variables) require order-stability. Verified: lint's
      `react-hooks/rules-of-hooks` error is gone, typecheck has no new errors, and
      the existing `GroupDetailScreen` tests from 2d still pass unchanged (972/972
      suite-wide).

      Still flagged, still **not** fixed: same file reads `group.emoji` /
      `trip.emoji`, neither of which exist on the `Group`/`Trip` models —
      currently harmless because of the `??` fallback, but worth a real decision
      (add the field, or remove the dead code) rather than leaving it silently
      type-broken. Not touched — bigger than a one-line fix, and a product call
      (does group/trip emoji customization ship or not) rather than a pure bug.
- [x] **2e — P2 CRUD/form screens.** Done — 14 cases across 6 new test files, all
      passing:
      - `CreateTripScreen` (2) — standalone create routes to add-participant;
        launching with `?groupId=` shows the member-picker step (not an immediate
        save) and submits with the pre-selected group members.
      - `EditTripScreen` (3) — pre-fills name/currency, saves via the real repo,
        replaces the form with a read-only message when the trip is closed.
      - `CreateGroupScreen` (2) — empty name doesn't create anything; creating with
        a manually-added member persists both and navigates to the group.
      - `EditGroupScreen` (2) — pre-fills fields and shows owner/guest labels,
        saves a name change and navigates back.
      - `GroupAddMemberScreen` (2) — manual add persists via the group repo, Done
        navigates back.
      - `AddParticipantScreen` (1) — **caught my own mistake before it shipped**:
        I first wrote 3 cases in a brand-new file without checking for existing
        coverage — turns out `src/features/invite/__tests__/addParticipant.test.tsx`
        already thoroughly covers manual add, duplicate rejection, contacts
        (granted/denied), and the invite-link panel (12 cases). Deleted the
        duplicate file; kept and added only the one genuinely new case (Done
        replaces to the trip detail screen) into the existing file. That file's
        own `expo-router` mock predated `standardMocks` and rendered
        `Stack.Screen` as `() => null`, hiding the Done button the same way the
        shared mock used to — swapped it to use `mockExpoRouterModule()` so the
        new case could actually find and press the button; all 11 pre-existing
        cases still pass unchanged.

      **Shared-infra improvement made along the way:** several of these screens
      put their primary action in the native header via
      `Stack.Screen options={{ headerRight }}`, but `standardMocks`' `Stack.Screen`
      mock rendered `null` — which would've hidden every one of those buttons from
      every test. Renamed `standardMocks.ts` → `.tsx` and taught the mock to
      actually render `options.headerLeft`/`headerRight`, so `getByLabelText`/
      `getByText` can find and press them like any other button. Retroactively
      benefits every earlier phase's tests too, not just 2e's.
- [x] **2f — P3 lower-risk screens.** Done — 13 cases across 4 new test files, all
      passing:
      - `InviteScreen` (3) — renders the invite link derived from the trip's
        token, "Share invite" calls the share service with the right args, shows
        a warning (no link) when the trip has no token yet.
      - `JoinScreen` (3) — invalid/expired token shows an error state instead of
        crashing, unauthenticated users get a sign-in prompt, a valid token while
        signed in joins and navigates to the trip.
      - `TripActivityScreen` (3) — preserves the hook's given order (reverse-
        chronological) rather than re-sorting, shows total spend + count, empty
        state.
      - Home tab (4) — trip and group cards render together, a trip that belongs
        to a group is correctly excluded from the standalone-trips section, the
        groups empty state shows when there's nothing at all, tapping a trip
        card navigates to its detail screen.

      **Process note, logged so it doesn't repeat:** initially wrote 3 new cases
      for `AddParticipantScreen` in a brand-new file without checking for
      existing coverage first — `addParticipant.test.tsx` already had 11 passing
      cases (manual add, duplicates, contacts, invite link). Deleted the
      duplicate, kept only the one genuinely new case (folded into the existing
      file — see the 2e entry above for detail). Checked for existing test files
      before writing new ones on every other 2f screen; none had prior coverage.

Phase 2 (component test plan) is complete: 6 sub-phases, ~90 new test cases,
2 real production bugs found and fixed along the way (`initialCollisionLabels`
in 2b, `expense.amountCents` in 2d), 1 pre-existing Rules-of-Hooks crash found
and fixed as a same-day follow-up, and one shared-infra improvement
(`Stack.Screen` header rendering) that benefits every phase retroactively.
Typechecked clean, full suite green and stable across repeated runs (997/997),
lint clean.

### Checkpoint 2

- [x] All six sub-phases landed; full suite green (997/997), stable across
      repeated runs
- [x] Every bug a test surfaced got logged in this file, and fixed or explicitly
      deferred with a reason (none were silently patched)
- [x] **Reviewed and signed off.** Phase 3 starting.

---

## Phase 3 — Duplicate screen unification

Order and sizing come from `trip-group-unification-analysis.md`. Settle is
deliberately excluded — two incompatible payment abstractions sit underneath it
(`IPaymentMethodRegistry` vs `IPaymentService`), which is a separate, larger problem
than screen duplication. Raise it separately if/when it's worth tackling.

- [ ] **3a — Extract shared presentational pieces**, no behavior change: name/currency
      form + dropdown overlay, member-avatar-row, balance/stat card. (Trip detail
      should also adopt the shared `Avatar` component it currently bypasses.)
      **In progress:**
      - [x] Currency picker (field label + trigger + dropdown overlay) extracted
        to `src/components/ui/CurrencyPicker.tsx`, applied to `CreateTripScreen`,
        `app/group/create.tsx`, `app/group/edit.tsx` — the three screens whose
        implementations were byte-for-byte identical modulo i18n keys. Each
        screen lost its own `dropdownVisible` state (now owned by the component)
        and its now-dead local `styles.backdrop`/`styles.sheet`. Deliberately
        **left `EditTripScreen` alone** — its currency picker uses a native
        `Modal` + `FlatList` instead of the inline-overlay pattern the other
        three share, so folding it in would be a real UX change, not a pure
        extraction. Revisit when 3b unifies Edit behaviorally. Full suite green
        (997/997), lint clean, verified with each screen's existing tests plus a
        full-suite run.
      - [x] Trip detail → adopt shared `Avatar` component. Swapped the
        hand-rolled 44×44 circle-with-initial `View` in `TripDetailScreen`'s
        Participants row for `<Avatar size="lg" />`. Passing `member.avatarUrl`
        through as a side effect of the swap means trip detail now shows real
        profile photos where available — it never did before, since the
        hand-rolled version only ever rendered the initial. Colors are
        unaffected (`personColors` entries are all white text, matching
        `Avatar`'s hardcoded fallback color exactly). Full suite green
        (997/997), lint clean.
      - [x] Member-avatar-row extraction. **Decision made: trip's stacked
        avatar-over-first-name layout wins** over group's side-by-side pill
        chip. Extracted to `src/components/ui/ParticipantsRow.tsx` (members +
        an `onInvitePress`/`inviteLabel`-driven trailing dashed invite circle,
        matching trip's exact pattern). Applied to both `TripDetailScreen` and
        `app/group/[id].tsx`. Group's screen also had two redundant invite
        affordances (a header "Invite" text link and a separate "Invite link"
        trailing chip, both calling the same handler) — removed the header
        link since `ParticipantsRow`'s embedded invite circle now covers that,
        matching how trip has never had a separate header invite action either.
        Kept the "Members" section title itself (group's multi-section screen
        benefits from it; trip's simpler screen doesn't have one). Cleaned up
        now-dead `memberChip`/`memberName` styles and unused `Avatar`/
        `personColors` imports on the group side, and `inviteCircle`/`Avatar`/
        `personColorFor` on the trip side. Full suite green (997/997), lint
        clean, all 4 existing `GroupDetailScreen` tests + all 4 existing
        `TripDetailScreen` tests pass unchanged.
      - [ ] Balance/stat card extraction — **grew into a bigger question,
        now its own analysis doc.** The user wants groups to get a settle-up
        experience like trip's, but with debts that persist through partial
        payment instead of closing — a real feature, not a styling merge.
        Full write-up, grounded in tracing the actual code (not assumptions):
        [`docs/group-ongoing-settlement-analysis.md`](./group-ongoing-settlement-analysis.md).
        Headline finding: there are 4 parallel "settled" mechanisms in the
        codebase today and only one (`Split.amountPaidCents`) is actually
        read by the balance math — the trip Settle screen's "Mark Paid"
        button doesn't currently reduce anyone's calculated balance at all
        (traced to `markDebtPaid()`, which only writes `SplitRequest.status`).
        The core settlement algorithm already behaves like an ongoing,
        cross-category ledger with no code changes needed there — the gap is
        entirely on the *write* side (no partial-payment API exists) and in
        `computeGroupBalances`'s two wholesale-exclusion filters (closed
        trip, settled expense), which are exactly the "wipe the slate"
        behavior the user doesn't want. **Awaiting the user's decision** on
        the doc's open product question (what gets recorded when someone
        marks a manual payment) before any of this gets built — this item
        stays unchecked and out of Phase 3's engineering scope until then.
- [x] **3b — Unify Create, then Edit.** Re-read all four screens
      (`CreateTripScreen`, `EditTripScreen`, `app/group/create.tsx`,
      `app/group/edit.tsx`) in their post-3a state before touching anything.
      **Decision: no config-driven merged screen.** The original plan's "small
      per-entity config with a pluggable member-onboarding slot" doesn't hold up
      once you look at what the member-onboarding sections actually do — group
      create has a full contacts-integration flow (permission request, search,
      dedup against pending members), trip create has a simple existing-member
      checkbox picker scoped to a parent group, and trip edit has no
      member-onboarding at all. Slotting that in would mean moving genuinely
      divergent logic into `if/else` branches of one bigger file, which is worse
      than four smaller files, not better. Extracted only the pieces that were
      actually byte-for-byte duplicated:
      - `src/components/ui/HeaderConfirmButton.tsx` — the circular checkmark
        header button, extracted from three identical copies (`CreateTripScreen`,
        `app/group/create.tsx`, `app/group/edit.tsx`). `EditTripScreen`
        deliberately not touched here — it uses a bottom `Button`, not a header
        action, a genuine UI-convention divergence, not incidental duplication.
      - `src/components/ui/LabeledTextInput.tsx` — the label + bordered
        text-input name field, extracted from four identical copies (all three
        above plus `EditTripScreen`).
      - `EditTripScreen`'s currency picker migrated from its native
        `Modal`+`FlatList` to the shared `CurrencyPicker` — the piece
        deliberately deferred from 3a for exactly this moment. Dropped the
        now-dead `dropdownVisible` state, `CURRENCIES`/`currencyLabel` imports,
        and the `useColors`/`inputStyle` local plumbing that only existed to
        support the hand-rolled version.
      - Both new components added to the `src/components/ui/index.ts` barrel
        alongside `CurrencyPicker` (which wasn't exported from there before
        this pass either).
      Verified per-file with `tsc --noEmit`, each screen's own test file, then a
      full-suite run (997/997 green) and a lint pass restricted to
      `/home/jaynorbert/weshare/...` paths (repo-wide lint output includes
      several unrelated background-agent worktrees under `.claude/worktrees/`
      and pre-existing issues in untouched files — neither is new here; none of
      the six touched files (four screens, two new components) produced a
      warning or error).
- [x] **3c — Unify Add-member.**
      - **Bug found and fixed first, before the unification itself:** comparing
        the two screens' `CurrentMembersSection`s surfaced `bg={palette.text}`
        passed to `Avatar` in trip's version — every entry in `personColors`
        has `text: '#ffffff'` (a constant, not a per-person value), so every
        avatar built this way rendered as a plain white circle with an
        invisible white initial. Group's equivalent correctly used
        `bg={palette.bg}`. Grepping the codebase found the same `bg={x.text}`
        mistake in **13 call sites across 10 files** — trip expense rows,
        payer selectors, line items, settlement rows, payout sections, the
        member-avatar stack, and more. Flagged the full blast radius to the
        user before touching anything; **user chose to fix it everywhere now**
        rather than scope it to just the two add-member files. Swept all 13
        call sites (`sed` targeted at the exact `bg={...text}` pattern, then
        verified each). Full suite green (997/997, including all 21
        snapshots — none of them asserted on the broken color), lint clean,
        no new type errors.
      - **Unification.** Investigated both screens' actual overlap rather
        than assuming the ~65–70% estimate translated directly into one
        merged component. Three pieces were genuinely identical (modulo
        i18n keys and minor accessibility-label gaps) and got extracted as
        controlled, DI-free presentational components so each screen can
        supply its own submit handler:
        - `src/components/ui/AddMemberNameField.tsx` — name input + add
          button + duplicate/generic error text. Takes `existingNames` and
          an `onAdd(name) => Promise<boolean>` callback; owns its own
          saving/duplicate/error state.
        - `src/components/ui/ContactsPickerList.tsx` — permission hint /
          loading / search + list. Took trip's version as the base (it had
          a couple of accessibility-label props group's didn't) and added
          `existingMembers` typed loosely (`{ displayName; phone? }[]`) so
          either `TripMember[]` or `GroupMember[]` satisfies it.
        - `src/components/ui/CurrentMembersList.tsx` — the member list with
          count label. `personColorFor(userId, members)` (trip) and
          `personColors[i % len]` indexed by loop position (group) turned
          out to compute the *same* index when iterating the same array in
          the same order — not a real divergence, just two ways of writing
          it — so this was a clean extraction too.
        - Also extracted `getInitials` to `src/core/utils/getInitials.ts`
          (was byte-identical in both files being edited). **Did not** sweep
          its ~10 other duplicate copies elsewhere in the codebase (
          `ExpenseRow`, `MemberAvatarRow`, `PayerSelector`, `GroupCard`,
          etc.) — out of scope for this pass, left as a minor future
          cleanup, not fixed silently.
      - **`app/group/add-member.tsx` rewired onto `useAddGroupMember`**, the
        hook it already had but never called — it was reimplementing the
        same repo/store calls inline. Manual-add and contact-add both now go
        through the hook; `GROUP_REPO`/`TRIP_STORE`/`isOk` are no longer
        imported directly in this file.
      - **Product call made, flagged rather than silently decided:**
        `FrequentPeopleSection` (quick-add suggestions from other trips) and
        `ShareInviteSection` (invite-link share panel) stayed trip-only —
        group has no invite-token/deep-link concept today, and "suggest
        people from other trips" doesn't have a group-side equivalent to
        pull from. Default taken: **do not backport**, not built for group.
        Revisit if you want this for groups too.
      - Both screens' `doneButton` also moved onto `HeaderConfirmButton`
        (3b's component) for consistency, passing `disabled={false}
        loading={false}` since neither ever disables or shows a spinner.
      - Verified per-file with `tsc --noEmit`, both screens' existing test
        files (all 14 pass, including a test that needed the
        `alreadyAddedAccessibilityLabel`/`addAccessibilityLabel` builder
        props added to `ContactsPickerList` to keep parity with trip's
        original per-item accessibility labels), a full-suite run
        (997/997), and a lint pass restricted to
        `/home/jaynorbert/weshare/...` — one pre-existing warning remains
        in `app/group/add-member.tsx` (`useEffect` missing `group` dep,
        deliberate `[group?.id]` pattern, unchanged from before this pass).
- [x] **3d — Unify Detail.**
      Read both screens in full before touching anything, same as 3b/3c.
      Three pieces were genuinely identical (or trivially reconcilable) and
      got extracted; three were real, deliberate divergences and got left
      alone rather than force-fit — matching what this item's own original
      wording already anticipated.
      - **Extracted:**
        - `src/components/ui/DetailHeaderBar.tsx` — back chevron + centered
          title + trailing action icon. Trip and group built this
          structurally identically (same `titleRow` style values in both
          screens' `StyleSheet.create`), differing only in the action icon
          (`edit-2` vs `settings`), its destination, and a cosmetic detail
          (trip wrapped the title in an extra centering `View`; group set
          `flex: 1, textAlign: 'center'` directly on the `Text` — same
          rendered result). Took group's simpler version as the shared
          implementation.
        - `src/components/ui/DetailExpenseRow.tsx` — icon tile + description
          + "`{payer} paid`" meta + amount. Byte-identical styles
          (`expenseRow`/`iconTile`/`expTitle`/`expMeta`/`expAmount`) in both
          screens' stylesheets. Trip additionally appends
          `· {expense.splitMode ?? 'equal'}` to the meta line — kept as an
          optional `metaSuffix` prop rather than dropped or forced onto
          group. **Note:** this is a different component from the existing
          `src/features/trips/components/ExpenseRow.tsx` (avatar + category
          icon, used by `TripActivityScreen`) — that one is a deliberately
          different visual style for a different screen, not touched.
        - `src/core/utils/balanceView.ts` (`toBalancesRecord`,
          `toBalanceBarMembers`) — both screens did the exact same
          `Object.fromEntries(balances.map(...))` / member-shape-narrowing
          one-liners feeding `BalanceViewSelector`; pulled out as two tiny
          pure functions.
      - **Left alone, flagged as deliberate (matches this item's own
        "needs explicit handling for" list from when it was written):**
        - **Balances/stat card.** Trip's card has an extra 3-stat strip
          (trip total / per person / your net) that group's doesn't, and the
          "Settle" button's visibility condition differs (trip:
          `status !== 'closed' && expenses.length > 0`; group:
          `settlements.length > 0`) — group also shows an "All settled"
          fallback trip never needed. This is the same territory as the
          balance/stat card question deferred out of 3a and into Phase 4
          (`group-ongoing-settlement-analysis.md`) — not touched here on
          purpose; revisit as part of that work, not this one.
        - **Body layout / FAB.** Trip's body is a single virtualized
          `FlatList` of expenses; group's is a plain `ScrollView` with
          separate "Trips" and "Expenses" sections (group has no trip-list
          concept on the trip side, and vice versa) plus a members section.
          Trip's FAB (`TripFAB`) is a single-action expand-on-empty button;
          group's is a hand-rolled 4-item speed-dial (new trip / new expense
          / new recurring / add member) with its own stagger animation.
          These aren't the same component with different props — they're
          different UI patterns for different action sets. Forcing a shared
          abstraction here would cost more than the duplication it removes.
        - **Observation, not a duplication issue, not fixed:** group's
          `activeTrips`/`activeGroupExpenses` are unbounded filters (all
          non-closed trips, all unsettled expenses) rendered via `.map()` in
          a plain `ScrollView` — no virtualization, unlike trip's `FlatList`.
          Could be a real scaling gap for groups with a lot of history, but
          it's a performance question orthogonal to cross-screen
          duplication (fixing it wouldn't reduce any shared code), so it's
          logged here rather than folded into this pass.
      - Verified per-file with `tsc --noEmit` (both files' only diffs from
        the pre-existing baseline are the two already-known `emoji`/
        `splitMode` type errors, unchanged in count, just shifted line
        numbers — confirmed via a saved baseline diff, not just eyeballing),
        both screens' existing test files (8/8 pass), a full-suite run
        (997/997), and a lint pass restricted to
        `/home/jaynorbert/weshare/...` — caught and fixed one real
        unused-import (`formatCurrency`, now handled inside
        `DetailExpenseRow`) before the pass came back clean.
- [x] **3e — Unify Expense detail.**
      - **Product decision (asked, not assumed):** of the three trip/group-only
        capabilities, only **receipts → backport to group** was chosen. Edit
        action (trip-only) and per-expense settle (group-only) both stay
        exactly as scoped today — not unified, not backported. Make-recurring
        stays group-only too (never in question — trips don't recur).
      - **Bug found and fixed:** group's "Paid by" avatar was hardcoded to
        `personColors[0]` — always the same (teal) color regardless of who
        actually paid, the only place in the whole codebase using a fixed
        palette index instead of one derived from the member's position
        (inconsistent even with the splits list two inches below it on the
        same screen, which correctly varies color per member). Fixed to use
        `personColorFor(expense.paidByUserId, group.members)`, matching
        trip's already-correct equivalent.
      - **Extracted** (genuinely identical or reconciled with one line of
        divergence):
        - `src/components/ui/ExpensePaidByCard.tsx` — avatar + eyebrow-style
          field label + payer name. Took trip's ledger-style label treatment
          (uppercase, letter-spaced) over group's plain caption — same
          "pick the more considered one" call as 3a's `ParticipantsRow`.
        - `src/components/ui/ExpenseReceiptSection.tsx` — image + fullscreen
          modal viewer, lifted wholesale from trip's screen (owns its own
          `useReceiptStorage()` call and loading/fullscreen state). Backported
          into group's expense detail per the decision above. Confirmed
          first that this needed no data-layer changes — `app/group/expense/
          add.tsx` already re-exports the same shared `ExpenseFormScreen` trip
          uses, which already writes `metadata.receiptUrl` generically for
          either entity type; group's detail screen was just never reading
          it back. Added two new test cases (`renders the receipt image
          when the expense has one` / `does not render a receipt section
          when the expense has none`) since this is genuinely new rendered
          behavior on the group side, not just a refactor.
      - **Left alone, deliberately** (per the product decision above, not
        overlooked): the header (trip: custom back/title/edit row, hides the
        edit icon behind a spacer on closed trips; group: plain native
        `Stack.Screen` title, no edit affordance at all — these differ
        *because* edit stays trip-only, so unifying the header would need
        the same conditional-hide logic anyway for no shared-code benefit);
        the splits list (trip tracks per-split partial payment/settled state,
        `amountOwedCents - amountPaidCents` plus a per-row settled badge;
        group settles the whole expense as one binary action — this is the
        same trip-vs-group settlement-model gap Phase 4 is scoped to address,
        not something to paper over here).
      - Verified per-file with `tsc --noEmit` (zero new errors in any touched
        file), both screens' existing test files plus the 2 new receipt
        cases (12 + 7 = 19 pass), a full-suite run (999/999), and a lint pass
        restricted to `/home/jaynorbert/weshare/...` — clean on first try.

**Bug found and fixed during your manual-testing pass for this checkpoint**
(2026-07-14, unrelated to the Phase 3 unification work itself — logged here
since this is where it surfaced): switching an expense's currency picker
*after* already typing an amount silently produced a stored value 100x too
large whenever the switch crossed a decimal-places boundary (e.g. EUR → JPY).
Root cause: `ExpenseFormScreen`'s currency dropdown only ever called
`setEntryCurrency(item.code)` — it never rescaled the already-computed
`totalAmountCents` (or the split-entry/line-item amounts) for the new
currency's minor-unit multiplier, so a value computed under EUR's ×100 scale
silently survived a switch to JPY's ×1 scale. Existing test coverage never
caught this because every prior currency-conversion test switched currency
*before* typing an amount, never after. Fixed:
`src/features/expenses/hooks/useSplitForm.ts` gained a `rescaleForCurrency`
function; `ExpenseFormScreen.tsx`'s currency-picker `onPress` now rescales
`totalAmountCents`, the raw display text, and any already-entered exact-mode/
itemized-mode amounts by the ratio of the two currencies' minor-unit
multipliers whenever the currency actually changes. Two regression tests
added to `ExpenseFormScreen.test.tsx`, covering both directions — EUR 50 →
JPY (`rescales an already-typed amount when switching from a 2-decimal to a
0-decimal currency`, expects 50 not 5000) and JPY 5000 → EUR (`...from a
0-decimal to a 2-decimal currency`, expects 5000.00 not 50.00) — both
verified to fail without the fix before confirming they pass with it. Full
suite green (1001/1001), no new tsc/lint issues in either touched file.

### Checkpoint 3

- [x] 3a–3e landed and reviewed
- [x] Confirm Settle stays a deliberately separate, un-started item — not silently
      picked up as part of "finishing" this phase
- [x] Mark this checkpoint `[x]` — sequence complete

**Signed off 2026-07-15.** Phase 4 continuing (4a already landed, resuming at 4b).

---

## Phase 4 — Ongoing settlement ledger

> **Revised 2026-07-14**, after a design discussion that changed the shape
> of this phase significantly — read
> [`docs/group-ongoing-settlement-analysis.md`](./group-ongoing-settlement-analysis.md)
> first, it now leads with a "Revised" note explaining the pivot. Short
> version of the change: instead of treating debt as a set of per-expense
> invoices that each get individually marked paid (allocate a payment
> oldest-first across specific outstanding splits, decide whether to reject
> or cap any overpayment), this is now a **running ledger per pair** —
> the mental model roommates and long-term friend groups actually use.
> Expenses debit the ledger, payments credit it, and overpaying just leaves
> a credit that quietly offsets whatever's next — no allocation logic, no
> overpayment edge case to special-case, because it's just subtraction.
> **This reshapes trip's settlement experience too, not just group's** —
> confirmed explicitly, since `calculateSettlements`/`computeMemberNetBalances`
> are shared code and forking them into a trip version and a group version
> would recreate the exact duplication this engagement has been removing.
> Per-expense "settled" badges (trip's `SettlementRow`, the split badge just
> added to `ExpenseDetailScreen` in Phase 3) are dropped entirely in favor of
> one shared ledger/transaction-history view — also confirmed explicitly,
> over the alternative of a best-effort, non-authoritative "looks settled"
> badge.

**Decisions made to turn the discussion into a buildable plan**, flagged
here so they're easy to override rather than discovered later — full
reasoning for each is in the analysis doc's "Decisions baked into this
plan" section:

1. **Reuse `SplitRequest` as the ledger entry** (relax `tripId` to optional,
   add `groupId?`) — it already has the right shape (payer, payee, amount,
   status, timestamp); no rename, no new model.
2. **Only completed `SplitRequest` rows (`status` = `paid`/`completed`)
   count as ledger credits** — falls directly out of the existing status
   enum, not a new rule.
3. **`Split.amountPaidCents`/`settledAt` stop being written**, but the
   fields stay in the model for now — removing them is a smaller, separate
   cleanup once the new path has proven out, not part of this build.

**Still open, deliberately deferred** (not resolved by this plan, see the
analysis doc's "Still open" section): what "closing" a trip or expense means
once it no longer hides debt (organizational-only is the obvious candidate,
not committed to here); the exact visual shape of the ledger/
transaction-history view; actually removing the now-dead `Split` fields.

**Code archaeology done before writing this checklist** (so it reflects what
the codebase actually does, not just the conceptual sketch): traced every
current caller of `computeMemberNetBalances`/`calculateSettlements`, how
`SplitRequest` is actually stored today, and what else reads
`Expense.settledAt`. Two things fell out that the earlier sketch didn't
name:

- **The store's `splitRequests` slice is keyed strictly by `tripId`**
  (`Record<tripId, SplitRequest[]>`, in `tripSessionStore.ts`), and
  `loadSplitRequests`/`saveSplitRequest`/`updateSplitRequest`/
  `appendSplitRequest` all bucket by `req.tripId`. Relaxing the model field
  to optional doesn't relax the store/repo layer built around it — that
  needs its own explicit work, below, or every group-scoped `SplitRequest`
  silently has nowhere to live.
- **`app/group/expense/[id].tsx`'s "Mark as settled" button
  (`useSettleGroupExpense`, writing `Expense.settledAt`) is a third
  dead-end-in-waiting**, not just trip's "Mark Paid" and the split badges
  already slated for retirement. It only currently "works" because
  `computeGroupBalances` excludes settled expenses wholesale — the exact
  filter 4c removes. Once 4c lands, this button stops affecting anyone's
  balance too, the same way trip's dead button does today, unless it's
  reconciled.

- [x] **4a — Foundation: data model, store/repo plumbing, and the ledger-aware balance calculation.** Done.
      - [x] **Model.** `src/core/models/SplitRequest.ts`: `tripId` relaxed to
            optional, `groupId?: string` added.
      - [x] **Repo interface + impls.** `getSplitRequestsForGroup(groupId)`
            added to `ISplitRequestRepository`, implemented in
            `InMemorySplitRequestRepository` (filter by `.groupId ===`) and
            `SupabaseSplitRequestRepository` (`.eq('group_id', groupId)`).
            Also updated the Supabase row mapper/insert payload
            (`trip_id`/`group_id` both nullable now) and
            `rowSchemas.ts`'s `splitRequestRowSchema` to match the same
            nullable-optional pattern `expenseRowSchema` already uses for
            the same trip-vs-group duality.
      - [x] **Store.** `tripSessionStore.ts` — went with a **parallel
            group-keyed slice** (`groupSplitRequests: Record<groupId,
            SplitRequest[]>`), not the "bucket by `tripId ?? group:${id}`"
            idea sketched when this checklist was written. Once actually
            looking at the code, the existing `expenses`/`groupExpenses`
            split is the established pattern for this exact trip-vs-group
            duality — mirroring it beat inventing a new composite-key
            scheme. `loadSplitRequestsForGroup` added; `saveSplitRequest`/
            `updateSplitRequest`/`appendSplitRequest` all branch on
            `req.groupId` vs `req.tripId` now. `selectGroupSplitRequests`
            added alongside `selectSplitRequests`.
      - [x] **Logic — the ledger-aware calculation.** `core/logic/settlement.ts`
            gained `LedgerPayment` (payer, payee, amount, **and `currency`**
            — added beyond the original sketch, since `calculateSettlements`
            needs a currency source for the payments-only-no-expenses edge
            case, which `Expense.currency` alone can't cover) and a shared
            `applyLedgerPayments` helper. `computeMemberNetBalances` and
            `calculateSettlements` both take `payments: LedgerPayment[] = []`
            now; every split's full `amountOwedCents` is always a debit,
            `Split.amountPaidCents`/`settledAt` are never read. Also
            extended `deriveTripFinancialSummary`'s signature the same way
            (backward compatible, defaults to `[]`) rather than leaving it
            unable to ever reflect payments — but did **not** wire real
            payment data into its only caller, `useTrips.ts` (the trips-list
            home screen card) — that call site wasn't in this item's
            original four, and pulling it in would have meant loading split
            requests for every trip on the home screen. Flagged here rather
            than silently expanded or silently skipped.
      - [x] **Call sites, four planned + one found dead:**
            - `useSettlement.ts` — now derives `completedPayments` from its
              already-loaded `splitRequests` and passes them through. This
              is the one that matters most: it's what finally makes
              `markDebtPaid` (trip's "Mark Paid" button) actually move the
              number, closing the exact dead-button gap this whole phase
              started from.
            - `TripDetailScreen.tsx` — didn't load split requests at all
              before; added a `loadSplitRequests` effect + `selectSplitRequests`
              + the same `completedPayments` derivation, feeding
              `computeMemberNetBalances` so "YOUR NET" reflects payments too.
            - `computeGroupBalances.ts` — signature gained `payments`, passed
              to both `calculateSettlements` and `computeMemberNetBalances`.
              **Caught myself mid-edit reaching for the two exclusion
              filters** (closed trip / settled expense) — removing those is
              4c's live-behavior-change item, not 4a's; restored them with a
              comment pointing at 4c so the boundary doesn't get blurred if
              this file is touched again before then.
            - `useGroupDetail.ts` (computeGroupBalances's caller) — a group's
              ledger spans *both* scopes, so this needed to load and merge
              completed payments from the group's own `groupSplitRequests`
              **and** every one of its trips' `splitRequests` — not just one
              or the other.
            - `BalanceBubblesSection.tsx` / `TripListHeader.tsx` — **found to
              be dead code**, not imported or rendered by any screen in the
              app (confirmed via repo-wide grep). Left untouched — their
              signatures still compile fine via `payments`'s default `[]` —
              rather than spend effort wiring real data through UI nothing
              reaches. Flagged instead of silently updated or silently
              ignored.
      - [x] **The "record a payment" primitive** — **deferred to 4b**, not
            built here. Reasoning: while wiring `useSettlement.ts`, marking a
            `SplitRequest` `'paid'`/`'completed'` — something the *existing*
            `markDebtPaid`/`updateRequestStatus` already do — now genuinely
            clears debt from the ledger, since those statuses are exactly
            what `completedPayments` counts as credits. That's not a
            coincidence to route around; it's 4a's calculation change doing
            its job on functions that already exist. A dedicated "record an
            arbitrary amount" primitive is still needed for 4b's partial-
            payment UI, but forcing it into 4a risked scope bleed into 4b's
            actual deliverable. The `requestMap`/`latestRequest` "latest
            only" trap flagged below **was hit for real**, not just
            theorized — see the test changes.
      - [x] **Tests.** `core/logic/__tests__/settlement.test.ts`: the old
            "already-settled splits" describe block (which set
            `Split.amountPaidCents`/`settledAt` directly — the exact
            mechanism just retired) rewritten into a "ledger payments" block:
            full payment zeroes a settlement, partial payment reduces it,
            one member's payment doesn't leak into another's debt,
            **overpayment produces a credit that visibly carries forward
            onto a later expense** (the core conceptual proof Checkpoint 4
            asks for), a payment with no prior debt still produces a
            sensible credit, and multiple payments between the same pair all
            sum (not just the latest — the `requestMap` trap, proven for
            real). `deriveTripFinancialSummary.test.ts`'s one
            `amountPaidCents`-based test converted to the ledger equivalent.
            Three more test files broke as a **direct, correct** consequence
            of the calculation change and got rewritten rather than
            papered over: `useSettlement.test.ts`'s `markSettled` test now
            asserts it's inert (superseded, not yet deleted);
            `splitRequest.test.ts`'s two `markDebtPaid` tests and
            `cacheInvalidation.test.ts`'s `updateRequestStatus` test now
            assert the settlement **disappears** once a request completes,
            instead of persisting with an updated status label — because it
            genuinely does now. `TripDetailScreen.test.tsx` and
            `useSettlement.test.ts` also got new tests proving a completed
            `SplitRequest` reduces a real, rendered balance end-to-end (not
            just the pure calculation function in isolation).
      - Verified: `tsc --noEmit` diffed against a saved pre-4a baseline —
        zero new errors anywhere (one pre-existing error even disappeared,
        unrelated). Full suite green and stable across two consecutive runs
        (1007/1007). Lint diffed the same way against a pre-4a baseline —
        every flagged line in a touched file was confirmed pre-existing.
- [x] **4b — The shared ledger/transaction-history view, wired to trip first.** Done.
      - [x] **Core logic.** `core/logic/settlement.ts` gained `LedgerEntry` and
            `buildLedgerHistory(fromUserId, toUserId, expenses, payments)` — a
            pure function producing a chronological, running-balance history
            for exactly one pair (every expense either side paid the other,
            every completed payment either side made). `LedgerPayment` gained
            two optional fields (`id?`, `date?`) needed only by this function,
            not by the balance/settlement calculations — kept optional so
            every existing call site is unaffected. Explicitly documented as a
            two-party view that isn't guaranteed to reconcile with the n-party
            greedy-matched `calculateSettlements` output once a third member
            is involved — it explains "how did we get here" for one pair, not
            a replacement for the settlement algorithm.
      - [x] **The "record a payment" primitive**, finally built: `useSettlement.ts`
            gained `recordPayment(fromUserId, toUserId, amountCents, currency)`,
            replacing `markDebtPaid`/`markDebtOwed`/`markSettled` entirely (all
            three removed, not just superseded). Deliberately always appends a
            new completed `SplitRequest` rather than finding-and-flipping an
            existing one — matching 4a's "multiple payments between the same
            pair all sum" model instead of the old single-latest-request
            pattern. `allSettled` could no longer be read off any row's status
            (a fully-paid pair now simply disappears from `settlements`
            instead of being flagged paid) — recomputed as
            `expenses.length > 0 && settlements.length === 0`, which also
            fixes a small pre-existing gap where a trip whose expenses always
            netted to zero could never show the "all settled" bar.
      - [x] **The ledger view itself**: `AuditDetailScreen.tsx` (still the
            `/settle/audit/[tripId]` route — kept the route stable) rewritten
            from a flat `SplitRequest`-only audit list into the real mixed
            expense-and-payment ledger, backed by a new
            `useLedgerHistory(tripId, fromUserId, toUserId)` hook. That hook
            deliberately reuses `useSettlement(tripId)` internally rather than
            re-loading the trip a second way — it already holds expenses,
            split requests, and `recordPayment`. Each entry shows description,
            signed amount (colour-coded debit/credit), date, and a running
            balance sentence; a bottom "Record a payment" button opens the new
            `RecordPaymentSheet` (amount pre-filled with the outstanding
            balance, editable for partial or over-payment), built on the
            existing `AmountInput` component rather than reinventing amount
            parsing. Old `useAuditHistory.ts`/its test deleted outright, not
            kept alongside.
      - [x] **`SettlementScreen.tsx` / `SettlementRow.tsx`** rewired: the old
            isPaid-checkmark-plus-undo branch is gone (a paid-off pair now
            just disappears from the list, so there's nothing left to flag as
            "paid" on a still-visible row); "Mark Paid" replaced by "Record"
            wired to the same `RecordPaymentSheet`, pre-filled with the full
            settlement amount but editable. The in-flight Stripe/OB
            spinner/status-badge branch (`isPaymentFlowStatus`/`isInTransit`)
            is untouched — that's a different, still-relevant concept
            (real-money payment execution, not the manual ledger entry).
      - [x] **Expense detail badge** (the other half of this item): the
            per-split "Settled" `Badge` in
            `src/features/expenses/screens/ExpenseDetailScreen.tsx` (trip
            side) removed outright rather than linked into the ledger —
            `Split.settledAt` is never written by any surviving code path
            post-4a, so the badge could literally never render again; each
            split now always shows its full `amountOwedCents` (no longer
            minus the dead `amountPaidCents`, for the same single-source-of-
            truth reason). **Group's equivalent badge in
            `app/group/expense/[id].tsx` deliberately left untouched** — that's
            the "third dead-end" flagged under 4c below, a live-behavior
            decision for that item, not this one.
      - [x] **Tests**: `core/logic/__tests__/settlement.test.ts` gained a
            `buildLedgerHistory` describe block (full payment zeroes the
            balance, partial payment shows as its own line, overpayment shows
            as a negative/credit balance, a credit carries forward onto a
            later expense, chronological ordering independent of input order,
            reverse-direction expenses, unrelated pair exclusion). New
            `useLedgerHistory.test.ts` and rewritten `AuditDetailScreen.test.tsx`
            cover the hook and screen directly. `useSettlement.test.ts`'s old
            `markSettled` describe block deleted (tested a function that no
            longer exists) and replaced with a `recordPayment` block;
            `splitRequest.test.ts`'s `markDebtPaid`/`markDebtOwed` tests
            replaced with `recordPayment` equivalents, including a direct
            repo-round-trip proof that multiple payments between the same
            pair sum rather than overwrite (the exact "requestMap latest-only"
            trap 4a's analysis named). Full suite green and stable across
            repeated runs (1009/1009), typechecked clean (diffed against a
            pre-4b baseline — the four remaining errors in touched-adjacent
            files are all confirmed pre-existing), lint clean (fixed one real
            new issue caught along the way — a `setState`-in-`useEffect`
            pattern in `RecordPaymentSheet`, rewritten as the React-recommended
            "adjust state during render on a prop change" pattern instead).
- [x] **4c — Decouple trip/expense-closing from group debt visibility.** Done
      (2026-07-15) — landed exactly the four decisions you made after
      reviewing the options rundown:
      - **Decision 1 — closing a trip is purely organizational.** Done.
            `computeGroupBalances`'s two wholesale-exclusion filters
            (`groupTrips.filter(t => t.status !== 'closed')`,
            `groupExpenses.filter(e => !e.settledAt)`) are gone — the ledger
            (expenses minus completed payments) is the only thing that
            determines what shows up. `computeGroupBalances.test.ts`'s two
            exclusion tests rewritten to assert the opposite (closed-trip
            and settled expenses now count).
      - **Decision 2 — retire the per-expense "Mark as settled" button
            entirely.** Done. Removed the button/badge/confirm-dialog from
            `app/group/expense/[id].tsx`; deleted `useSettleGroupExpense.ts`
            and its test outright (not superseded-in-place — the whole
            per-expense granularity concept is gone, matching how trip's
            split badges and `ExpenseDetailScreen`'s badge were retired in
            4b). Its push-notification integration tests
            (`useSettleGroupExpense — notifications` in
            `notifications.test.ts`) deleted along with it. `Expense.settledAt`
            and the `settleExpense` repo method/store action are left in the
            model as dormant plumbing — same deferred-cleanup precedent as
            4a's `Split.amountPaidCents`/`settledAt`, not removed here.
            `useGroupDetail`'s `activeGroupExpenses`/`settledGroupExpenses`
            split collapsed into one `groupExpenses` list (all of them, no
            bucket) — there's no more "settled" state to bucket by.
      - **Necessary follow-through, flagged rather than assumed:** retiring
            the per-expense button left the group's bulk **"Settle
            everything"** action incoherent — it still called `settleExpense`
            + closed every trip, which (once decision 1 landed) no longer
            reduces anyone's actual debt. Folded in the minimal fix this
            requires (this is 4e's own described design, pulled forward
            because leaving the button broken/misleading wasn't an option):
            `useSettleAllGroupDebts` now takes the group's current
            `settlements` and records one completed, group-scoped payment
            per pair via a new `createManualPaymentRequest()` factory in
            `core/models/SplitRequest.ts` (shared with `useSettlement`'s
            `recordPayment`, which was refactored to use it too — same
            object-construction logic, no longer duplicated). It **no
            longer touches expenses or trips at all** — paying off debt and
            archiving are independent actions now. Calls the split-request
            repo directly rather than the store's `saveSplitRequest`
            wrapper, since the latter only tracks one `hydrationError` at a
            time and would race when saving several pairs concurrently.
            Button copy updated ("Mark everything settled" →
            "Settle everything") to match what it actually does now.
      - **Decision 3 — reversibility.** Done, scoped to trip reopening (the
            only thing left that's reversible once decision 2 removed
            per-expense settling from existence — there's nothing left to
            "un-settle"). `SettlementScreen.tsx` now shows a "Reopen Trip"
            link whenever `tripStatus === 'closed'`, wired to `reopenTrip()`
            — which already existed on `useSettlement` since 4b's day one
            but had no UI entry point. Shown regardless of `allSettled`,
            since a closed trip can now genuinely still carry debt.
      - **Decision 4 — a History view.** Done. `app/group/[id].tsx` gained a
            "View past items" / "Hide past items" toggle (reusing
            `groups.detail.view_past`/`hide_past`/`past_section` i18n keys
            that already existed in both locale files but were never wired
            to anything) revealing closed trips, rendered with the existing
            `ClosedTripCard` component (already built for the standalone
            trips list, reused as-is — same navigation to `/trip/${id}`).
            `useGroupDetail` now also returns `tripExpenses` so the card's
            `expenseCount` prop has something to read. There's no equivalent
            "past expenses" section — decision 2 means there's no separate
            settled-expense bucket left to show one for.
      - Verified: full suite green and stable across repeated runs
            (1001/1001 — count differs from 4b's 1009 by the tests removed
            with `useSettleGroupExpense`'s retirement, not a regression),
            typechecked clean (diffed — the handful of remaining errors are
            all confirmed pre-existing, unrelated to this pass), lint clean
            (one real issue caught and fixed — a stray unused import in
            `notifications.test.ts` left behind after deleting the describe
            block that used it).
- [x] **4e — Reconcile the bulk "settle everything" action.** Landed as part
      of 4c above (see "necessary follow-through" — retiring the per-expense
      button made this unavoidable rather than a later, separate step).
      Trip/expense closing is purely organizational now and has stopped
      being a debt-visibility mechanism anywhere in the app.
- [x] **4d — Extend the ledger view to group.** Done (2026-07-15).
      - [x] **`useGroupDetail` gained the group-scoped write/read primitives**
            4b's trip-side hook already had: a `recordPayment(fromUserId,
            toUserId, amountCents, currency)` (same
            `createManualPaymentRequest()` factory as trip's, just with
            `groupId` set instead of `tripId`), a `recording` busy flag, and
            `completedPayments` gained the `id`/`date` fields the ledger view
            needs (previously built only for the balance calculation, which
            doesn't need them). Also now returns `groupTrips` (previously
            only its `activeTrips`/`closedTrips` subsets) so a ledger's
            "all expenses touching this group" list can be assembled outside
            the hook without re-deriving it.
      - [x] **New `useGroupLedgerHistory(groupId, fromUserId, toUserId)`**
            hook — the group-scoped counterpart of 4b's `useLedgerHistory`,
            reusing the same pure `buildLedgerHistory()` function from
            `core/logic/settlement.ts`. Deliberately a separate thin hook
            rather than one hook branching internally on scope: it mirrors
            the existing `useSettlement` (trip) / `useGroupDetail` (group)
            split already established, not new duplication.
      - [x] **`AuditDetailScreen` generalized to both scopes** — the actual
            "reuse the same component" ask. `auditParamsSchema` now accepts
            either `tripId` or `groupId` (exactly one, enforced via `.refine`).
            Restructured into three small pieces: `AuditDetailScreenContent`
            picks a scope, `TripLedgerView`/`GroupLedgerView` each call their
            own hook (unconditionally, one per component — correct under
            Rules of Hooks) and hand the result to one shared `LedgerView`
            that owns 100% of the actual rendering (header, entries list,
            empty/error states, the "Record a payment" button and sheet) —
            not a single line of UI duplicated between scopes. New route
            `app/group/settle/audit/[groupId].tsx` added (same thin
            re-export pattern as the existing trip route); the trip route
            was left alone rather than renamed, so both can coexist and pass
            different param shapes to the one screen component.
      - [x] **`app/group/settle/[id].tsx` wired up**: each suggested-transfer
            card is now tappable (navigates to the new group audit route,
            same as trip's `SettlementRow`) and gained a "Record" action
            opening the same `RecordPaymentSheet` component 4b built for
            trip, pre-filled with that pair's full outstanding amount but
            editable. **Deliberately did not** restructure this screen's own
            card-based layout to match trip's `SettlementRow` row layout —
            unifying the two settle screens' visual structure was explicitly
            scoped out back in `trip-group-unification-analysis.md` (two
            incompatible payment abstractions sit underneath them) and
            nothing about this task changes that; only the ledger view and
            the record-payment primitive are shared, as asked.
      - Verified: full suite green and stable across repeated runs
            (1011/1011), typechecked clean (one real new issue caught and
            fixed — `AuditDetailScreen`'s `error` prop is `unknown` in the
            now-shared `LedgerView`, and `{error && ...}` doesn't type-check
            as a bare truthy-check on `unknown` in JSX; wrapped in
            `Boolean(error)`), lint clean.

### Checkpoint 4

- [x] 4a–4e landed and reviewed
- [x] The dead-button regression test from 4b is in place and passing —
      this is the concrete, verifiable proof the feature actually works
- [x] Overpayment produces a credit that visibly carries forward onto a
      later expense in at least one test — the concrete, verifiable proof
      the core conceptual change actually works, not just that it compiles
- [x] 4c's behavior change was explicitly signed off before landing (you
      reviewed the options rundown and made all four decisions explicitly),
      not folded in silently as part of "finishing the phase"
- [x] Mark this checkpoint `[x]` — sequence complete
