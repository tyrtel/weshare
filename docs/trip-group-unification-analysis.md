# Trip/Group screen unification — analysis

Prompted by the screen-count question during the test-plan discussion: 23 screens felt
high, and the biggest single reason is that **trips and groups duplicate nearly every
screen** (create, edit, detail, settle, add-member, expense-detail). This doc looks at
whether that duplication is accidental (worth collapsing) or structural (worth leaving
alone), pair by pair, based on reading every file involved — not a guess.

## Verdict up front

**Partially collapsible, in phases — not a single merge.** The data layer is already
unified (see below); the screens are duplicated because Group was built by literally
mirroring Trip's screens field-for-field. Create/Edit/Add-member are good, low-risk
unification candidates. Detail is a medium-effort candidate. **Settle is not** — trip
and group settlement run on two entirely separate, non-interoperable payment
abstractions, which is a bigger and riskier problem than screen duplication and
shouldn't be bundled into this effort.

Do this only after the component-test plan from the earlier conversation has real
coverage in place — none of these screens (except partial coverage on
`TripDetailScreen`/`SettlementScreen`) have any tests today, and a refactor without a
safety net is how this session's regressions happened in the first place.

---

## What's already shared (better foundation than the screen count suggests)

The original "Groups Feature Design" planning doc called for parallel `GroupExpense`/
`GroupSplit` models and a `GROUP_EXPENSE_REPO` token. **That's not what actually got
built.** What's in the codebase today:

- **One `Expense` model**, discriminated by optional FK: `tripId?` / `groupId?`. Same
  for `Split`. There is no separate `GroupExpense` type.
- **One `EXPENSE_REPO` token** — group expenses go through the same
  `IExpenseRepository` as trip expenses. No `GROUP_EXPENSE_REPO` exists.
- **One settlement algorithm.** `core/logic/settlement.ts`
  (`calculateSettlements`, `computeMemberNetBalances`) is called directly by trip
  screens and, on the group side, wrapped by a 46-line adapter
  (`src/features/groups/utils/computeGroupBalances.ts`) that synthesizes
  `TripMember`-shaped objects from group members. The math itself is single-sourced.
- **One Zustand store** (`TRIP_STORE`) holds both `trips` and `groups` — trips and
  groups aren't even separate persistence layers at the client-state level.
- **`TripMember` and `GroupMember` are field-for-field identical** except the foreign
  key name (`tripId` vs `groupId`). Every other field — `userId`, `displayName`,
  `joinedAt`, `isGuest`, `phone?`, `email?`, `avatarUrl?` — matches exactly.

This is the main reason unification is tractable at all: the expensive part (reconciling
two different data shapes) is already done. What's left is screen- and hook-level
duplication built on top of that shared foundation.

## What's genuinely different (not just style — product-level)

- **Group has no `status`/`closedAt`.** Trips can be `active` / `settling` / `closed`;
  groups have no lifecycle state at all. `ClosedTripGuard` is trip-only.
- **A Trip can belong to a Group** (`Trip.groupId?`). This is a real parent/child
  relationship — a group can contain multiple trips plus its own direct expenses — not
  two peer concepts. A full "merge Trip and Group into one entity" would be wrong; they
  nest.
- **Group supports recurring expenses; Trip does not** (zero "recurring" references
  anywhere under `src/features/trips`).
- **Trip settlement has a payment layer group settlement completely lacks**: per-debt
  mark-paid/mark-owed, a payment-method registry (`IPaymentMethodRegistry`) wired to
  Stripe and Open Banking/IBAN, a `SplitRequest` audit trail, an
  `AppState`-driven "did you just pay?" confirmation flow, and a rollover-to-new-trip
  screen. Group settlement has exactly one action — "settle everything" — built on a
  **second, separate payment abstraction** (`IPaymentService`, a single hardcoded "Pay
  with Wero" deep link).

  This last point is the biggest asymmetry in the whole codebase, and it predates and
  is independent of the screen-duplication question. Unifying the settle screens would
  require first unifying `IPaymentMethodRegistry` and `IPaymentService` into one
  abstraction — a separate, larger initiative. Treat it as out of scope here.

---

## Pair-by-pair

### Create — `CreateTripScreen.tsx` (333 ln) vs `app/group/create.tsx` (519 ln)

**Overlap:** ~30–40%. The name/currency form, the custom currency-dropdown overlay, and
the header confirm-button pattern are close to byte-identical (same styles, same
`ErrorBanner`/accessibility pattern), just under different i18n key namespaces.

**Real differences:**
- Member handling is a different *shape* of feature, not a skin: Trip's create screen
  optionally shows a checkbox picker of an existing group's members (only when
  launched with `?groupId=`); Group's create screen has manual add + full
  `expo-contacts` integration, with member creation orchestrated **in the screen**
  (not the hook) via direct `GROUP_REPO`/store calls.
- `useCreateTrip` wraps everything in an 8–10s `withTimeout()`; `useCreateGroup` has no
  timeout handling at all.
- Both hooks independently define an identical `generateInviteToken()` — literally
  copy-pasted, not shared.
- Different navigation targets after save (trip: conditional on `groupId`; group:
  always `/group/[id]`), different currency defaults (trip inherits from parent group;
  group hardcodes `'EUR'`).

**Sizing: M.** The form scaffolding is trivially shareable. The member-onboarding step
is genuinely different per entity and would need to stay as a pluggable slot, not be
forced into one shape.

### Edit — `EditTripScreen.tsx` (195 ln) vs `app/group/edit.tsx` (294 ln)

**Overlap:** ~25–30%, and smaller than it looks — the two screens use different UI
conventions outright (Edit Trip: bottom `<Button>` + native `Modal` currency picker
with its own **locally hardcoded, duplicated 7-entry `CURRENCIES` array** that can
drift from the real one in `core/constants/currencies`; Edit Group: header checkmark +
inline dropdown overlay, correctly importing the shared `CURRENCIES`).

**Real differences:**
- Group edit has member list + add-member + delete-group, none of which exist on trip
  edit at all (trip has no delete; trip lifecycle goes through `status`, not deletion).
- Trip edit has a **currency-migration cascade** on save — changing currency walks
  every expense still in the old currency and updates it via `EXPENSE_REPO`. **Group
  edit has no equivalent.** Changing a group's currency silently leaves its expenses
  in whatever currency they were entered in. This is a real bug worth fixing on its
  own, unification aside.
- Different data-loading patterns: trip edit uses a fetch hook + a manual
  `initialised` flag set during render; group edit reads synchronously from the
  Zustand store with no loading state.

**Sizing: M, with a pre-existing bug to fix regardless** (the currency-cascade gap).
The stray duplicated `CURRENCIES` array in `EditTripScreen` should be deleted and
replaced with the shared import even if the rest isn't touched — it's a one-line-risk,
high-value fix on its own.

### Detail — `TripDetailScreen.tsx` (248 ln) vs `app/group/[id].tsx` (357 ln)

**Overlap:** ~40–45%. Header row, balance card skeleton, expense-row rendering, and
member-avatar rendering are structurally near-identical, each re-implemented in a
separate `StyleSheet.create` block with copy-pasted values (`titleRow`, `card`,
`expenseRow`, `iconTile`, etc.).

**Real differences:**
- Trip: `FlatList` + pull-to-refresh + skeleton loading state + a dedicated
  `TripFAB`. Group: plain `ScrollView`, no pull-to-refresh, no skeleton, a hand-rolled
  animated 4-action speed-dial FAB (`react-native-reanimated` spring/delay
  animations) that doesn't exist on the trip side.
- Group detail has to show **nested trips** and **direct group expenses** as separate
  sections — a structural concept trip detail has no equivalent of.
  Trip detail has a **stat strip** (trip total / per-person / your net) — group detail
  has no equivalent, going straight to the balance view.
- Trip detail hand-rolls its own avatar circles instead of using the shared `Avatar`
  component that group detail already uses.
- Group's invite flow routes to a separate screen; trip's is an inline `Share.share`
  call.

**Sizing: L.** Worth doing, but only after Create/Edit establish the shared-adapter
pattern — Detail has the most surface area and the clearest need for a config object
(what sections exist, what the FAB offers, whether a status banner renders) rather than
a single shared component.

### Add-member — `AddParticipantScreen.tsx` (762 ln) vs `app/group/add-member.tsx` (451 ln)

**Overlap: ~65–70% — the best candidate in this whole list.** Nearly all of the shared
plumbing (`getInitials`, duplicate-name checking, the manual-add section, the contacts
section including permission handling and search, the current-members list, the header
button) is structurally identical logic, differing only in which model/repo/store call
it invokes.

**Real differences:**
- Trip has two whole features group lacks entirely: a cross-trip "frequent people"
  suggestion panel, and an invite-link share panel (copy/share the trip's
  `inviteToken`) — despite `Group` having an `inviteToken` field that's simply never
  surfaced in the group add-member screen.
- Trip guest IDs are plain `generateId()`; group guest IDs are prefixed
  `guest_${generateId()}` — a real, if small, ID-shape divergence to reconcile.
- `useAddGroupMember` exists as a self-contained hook but **isn't used** by
  `app/group/add-member.tsx`, which reimplements the same logic inline instead — this
  screen already has internal duplication before you even compare it to the trip side.

**Sizing: S–M.** Highest overlap, most mechanical differences (repo tokens, ID
prefixing, done-button destination), and a good first real target once the Create/Edit
pattern exists. Also the one place with a pre-existing dead-code cleanup available for
free (wire the screen to `useAddGroupMember` instead of its inline reimplementation).

### Expense detail — `ExpenseDetailScreen.tsx` vs `app/group/expense/[id].tsx`

(Known firsthand from this session — both were read and one was rewritten earlier.)

**Overlap: moderate.** Same underlying `Expense`/`Split` data (this is the one pair
with zero data-model divergence, since `Expense` is already unified). Divergence is in
how the expense is *looked up* — trip side goes through `useExpenseDetail(id)` backed
by `EXPENSE_REPO`; group side reads directly out of the Zustand store's
`groupExpenses[groupId]` slice — and in which features each side has:

**Trip has, group lacks:** receipt image capture/display + fullscreen viewer, delete
action.
**Group has, trip lacks:** per-expense settle action, "Make recurring" entry point.

Neither side is a superset — **each is missing something the other has.** This is the
clearest evidence in the whole comparison that the duplication has already caused real
feature gaps, not just extra code to maintain. The currency-conversion caption I just
added to the trip side is a live example: it needs to be ported to the group side by
hand rather than existing once. Screen unification for this pair would fix two
standing feature gaps as a side effect, though it needs an explicit decision on whether
"settle this one expense" and "receipts" are meant to apply to both trip and group
expenses, or are deliberately scoped to one side.

**Sizing: M.** Overlap is real but the pair also needs a product decision (which
features become universal) before it's purely an engineering task.

### Settle — `SettlementScreen.tsx` (304 ln) vs `app/group/settle/[id].tsx` (221 ln)

**Overlap: ~15–20% — the weakest candidate, not recommended.** Covered in the
"genuinely different" section above. The debt-simplification math is shared; almost
everything else — payment execution, per-transfer status, audit trail, rollover,
confirmation UX, haptics — is not, and two incompatible payment abstractions sit
underneath the two screens. Unifying the screens without first unifying
`IPaymentMethodRegistry`/`IPaymentService` would mean building a UI that has to branch
on "which entirely different payment system is this," which defeats the purpose.

**Sizing: XL, and out of scope for this pass.** Flag as its own initiative if pursued.

---

## Recommended sequencing

Each phase should ship with component tests for the screens it touches (see the
earlier test-plan artifact) before behavior is merged, not after.

1. **Extract shared presentational pieces first**, no behavior change: the
   name/currency form + currency-dropdown overlay (used identically by both Create
   screens and, partly, both Edit screens), a shared member-avatar-row component
   (trip detail should adopt the `Avatar` component group detail already uses), and a
   shared balance/stat card. Immediate duplication reduction, near-zero risk.
2. **Fix the two standing bugs surfaced by this comparison while the code is open
   anyway:** `EditTripScreen`'s duplicated/driftable local `CURRENCIES` array, and
   `EditGroupScreen`'s missing currency-migration cascade on expenses.
3. **Unify Create, then Edit**, via a small adapter/config passed to a shared
   screen — entity type, repo tokens, navigation targets, and a pluggable
   "member onboarding" slot (since that part is genuinely different per entity, not
   just parameterizable).
4. **Unify Add-member** — highest overlap, lowest risk, and rewire
   `app/group/add-member.tsx` to use the `useAddGroupMember` hook it already has but
   ignores. Decide whether to backport "frequent people" and the invite-link panel to
   the group side, or explicitly scope them trip-only.
5. **Unify Detail**, once the adapter pattern is proven out in steps 3–4. Needs a
   config-driven answer for: does a status banner render, what sections appear
   (nested trips / recurring), what does the FAB offer.
6. **Expense detail**: decide product-side whether receipts and per-expense-settle
   apply to both trip and group expenses, then unify the display screen — the data
   layer already supports it.
7. **Settle stays separate** unless/until `IPaymentMethodRegistry` and
   `IPaymentService` are unified as their own project.

## What this buys, and what it costs

**Buys:** meaningfully less code to keep in sync (today, a fix to one side — like the
currency-conversion caption — has to be remembered and manually ported to the other,
and clearly isn't always happening, per the expense-detail feature gaps above); fewer
places for the kind of state/logic bug this session kept finding to hide; two real
pre-existing bugs (currency-cascade gap, drifting hardcoded currency list) get fixed as
a byproduct rather than needing their own effort.

**Costs:** every "difference" enumerated above has to become an explicit, tested
branch in a shared component rather than living implicitly in a separate file. That's
where regressions get introduced during a merge like this — which is exactly why test
coverage needs to exist *before* this work starts, not be added afterward as cleanup.
