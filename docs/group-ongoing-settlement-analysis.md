# Ongoing settlement ledger — feasibility analysis

> **Revised 2026-07-14.** The original version of this doc (below, largely
> intact) analyzed a narrower ask: give groups a settle-up experience like
> trip's, with partial payments that reduce a balance without "closing"
> anything. Working through it surfaced a bigger, better-fitting idea: stop
> modeling debt as a set of per-expense invoices that each get individually
> marked paid, and instead model it as a **running ledger per pair** — the
> way roommates and long-term friend groups actually think about shared
> expenses. Overpaying isn't an edge case to reject or cap; it's just a
> credit that quietly offsets whatever's next. This revision reframes the
> plan around that model. Because the balance math
> (`calculateSettlements`/`computeMemberNetBalances`) is shared code, this
> isn't group-only — **it reshapes trip's settlement experience too**,
> replacing its per-split "settled" badges with the same ledger view. That
> was a deliberate scope call, not an oversight: forking the calculation
> into a trip version and a group version would recreate exactly the kind
> of duplication this whole engagement has been removing.

## What's being asked for (revised)

One running balance per pair of people, wherever their shared expenses come
from — a trip, several trips, or expenses logged directly against a group.
Expenses add to it; payments subtract from it; there is no per-expense
"settled" state to track, no invoice to close. If a payment overshoots what
was owed at that moment, the excess isn't rejected or capped — it just makes
the balance go negative (a credit), which the next expense between the same
two people quietly draws down. What "closing" a trip or an expense means —
if anything — stays an open, deliberately deferred question (see below); it
should not be a mechanism that makes debt disappear from the ledger.

## The headline finding: there are four parallel "settled" concepts, and only one of them affects the math

Tracing every place a debt can be marked settled today turned up four
independent mechanisms. Only the first one is actually read by the balance
calculation:

| Mechanism | Where | Read by `calculateSettlements`? | Granularity |
|---|---|---|---|
| `Split.amountPaidCents` / `settledAt` | `core/models/Split.ts` | **Yes — the only one that is** | Per split, supports partial amounts |
| `Expense.settledAt` | `core/models/Expense.ts` (group expenses) | No — only read by `computeGroupBalances`'s exclusion filter | Whole expense, binary |
| `SplitRequest.status` | `core/models/SplitRequest.ts` | No, not at all | Per debtor↔creditor pair, payment-attempt audit trail |
| `Trip.status === 'closed'` | `core/models/Trip.ts` | No — only read by `computeGroupBalances`'s exclusion filter | Whole trip, binary |

The concrete, verified consequence: **the trip Settle screen's "Mark Paid"
button doesn't currently reduce anyone's calculated balance.** I traced it —
`SettlementRow`'s `onMarkPaid` calls `markDebtPaid()` in `useSettlement.ts`,
which only writes `SplitRequest.status = 'paid'`. `calculateSettlements` never
looks at `SplitRequest` at all. The one function that *does* write to the
field the math reads — `markSettled()`, which sets
`Split.amountPaidCents = amountOwedCents` — is defined in `useSettlement.ts`
but **is never called from any screen.** It's dead code today.

Under the revised model, this table changes shape rather than just getting a
fix applied to row 1: **`Split.amountPaidCents`/`settledAt` stop being
written at all.** A `Split` becomes debit-only — it represents an expense
share and nothing else, created once and never mutated again. `SplitRequest`
becomes the credit side: a real ledger entry (see below). Rows 2 and 4 of
this table (`Expense.settledAt`, `Trip.status`) still need their
debt-hiding side effects removed (per (D) below) — but what they mean
*organizationally* (hide a trip from "active," stop new expenses landing on
it) can stay, decoupled from the ledger entirely.

## The good news: the aggregation is already exactly the right shape for a ledger

`calculateSettlements`/`computeMemberNetBalances` (`core/logic/settlement.ts`)
already net every member down to **one number** — positive if they're owed
money, negative if they owe it — recomputed fresh from whatever `Split` rows
currently exist. There's no "finalize" or "close" step anywhere inside the
algorithm. That's already a running ledger's math, at the per-member level.

What `calculateSettlements` adds on top is a *debt-simplification* pass: given
everyone's net numbers, it suggests the minimal set of pairwise transfers that
would zero everyone out — e.g. if Alice owes Bob $10 and Bob owes Carol $10,
it suggests "Alice pays Carol $10" directly, skipping Bob, even though no
expense ever linked Alice and Carol. This matters for how payments should be
recorded (see below): **a real payment has two real sides — Alice actually
sends Bob money — but the suggested pairing between two people can shift as
new expenses land, even for debts that didn't change.** The clean resolution:
record real payments as real (payer, payee, amount) events — that's the truth
of what happened — but feed them into the *net* calculation as a credit
against the payer's own balance, not as something tied to the original payee.
The minimal-transfer suggestion keeps working exactly as it does today, on
top of one number instead of the same one number; a ledger view shows the
real history underneath it.

And `computeGroupBalances` (`features/groups/utils/computeGroupBalances.ts`)
already merges a group's trip expenses and direct group expenses into one
call to that same function — the "spans categories" requirement is already
solved, structurally, today.

In other words: the hard part — an algorithm that's naturally a running,
continuously-recomputed number per person, aggregated across categories —
already exists and already works. Everything below is about the *write* side
and the UI built on the old invoice-per-expense assumption.

## `SplitRequest` is already shaped like a ledger entry

Re-reading the model rather than just its `status` enum: `SplitRequest`
already has `requesterUserId` (creditor), `payerUserId` (debtor),
`amountCents`, `currency`, `createdAt` — that's a payment-ledger row, not
just a request-tracking row. The `status` field already distinguishes
in-flight from completed:

- `'owed'` — an ask, not yet paid. Doesn't move the balance.
- `'created'` / `'request_sent'` / `'authorized'` / `'pending'` — in-flight
  Stripe/Open Banking flow. Doesn't move the balance yet.
- **`'paid'` / `'completed'`** — money actually moved. **These are the rows
  that should sum into the ledger credit side.**
- `'declined'` / `'expired'` — failed. Doesn't move the balance.

This means `SplitRequest` doesn't need new fields to *become* a ledger entry
— it already has the payer/payee/amount shape, and its status enum already
tells you which rows represent real, completed payments. It only needs the
scope relaxation already identified: `tripId` from required to optional, plus
a new `groupId?`, mirroring the exact optional-FK pattern `Expense` and
`Trip` already use for the same trip-vs-group duality. No rename needed — the
name "request" undersells what the model already does once you include its
completed states, but renaming it isn't necessary to build this.

## The actual gaps (revised)

1. **No code path writes a `SplitRequest` in a `paid`/`completed` state as a
   general "record a payment" action.** `markDebtPaid()` writes `'paid'` but
   nothing reads it. There's no function that (a) creates a completed
   `SplitRequest` row for an arbitrary amount and (b) is actually called from
   the balance calculation's credit side.
2. **`computeMemberNetBalances`/`calculateSettlements` don't read
   `SplitRequest` at all today** — the credit side of the ledger doesn't
   exist in the math yet. This is the core gap: extend the net-balance
   calculation to be `sum(Split.amountOwedCents owed by this person) -
   sum(completed SplitRequest.amountCents paid by this person)`, full stop.
   No per-split allocation, no oldest-first walk, no cap — overpayment falls
   out of that subtraction for free as a negative number.
3. **`computeGroupBalances` actively hides paid-down debt instead of letting
   it net to zero naturally.** Its two filters —
   `groupTrips.filter(t => t.status !== 'closed')` and
   `groupExpenses.filter(e => !e.settledAt)` — are exactly the "wipe the
   slate" behavior that conflicts with a running ledger. A closed trip's
   expenses vanish from the group ledger *regardless of whether they were
   actually paid.* These filters need to go, in favor of letting the ledger
   speak for itself. (Unchanged from the original analysis — this gap exists
   under either model.)
4. **Every settle-related UI today assumes per-expense/per-split
   granularity — badges, "this split is settled," "this expense is
   settled."** Under the ledger model this stops being a coherent question:
   a single payment can partially cover parts of two different expenses at
   once, so "is expense #47 settled" doesn't have a clean yes/no answer
   anymore. This applies to **both** trip's `SettlementRow`/split badges
   and the split-level badge just added to `ExpenseDetailScreen` — both need
   to be replaced with a ledger/transaction-history view (chronological
   list of expenses-as-debits and payments-as-credits, with a running
   total), not patched to keep working.
5. **Group's only settle action is bulk, not incremental, and trip's
   per-debt UI doesn't move the needle either** (see the headline finding).
   Neither is a template to extend as-is; both get replaced by the same
   shared ledger-recording action.

## What would actually need to be built (revised)

Not a commitment to build this — a concrete sketch so the size and shape of
the work is visible before deciding.

**A. A real "record a payment" primitive.** One function: given a payer, a
payee, an amount, and a scope (trip or group), creates a `SplitRequest` row
with a completed status for that amount. No allocation logic against
specific splits — the row itself *is* the ledger entry. This is the entire
crux of the write side, and it's simpler than the original oldest-first-walk
design because there's nothing to walk.

**B. Extend the net-balance calculation to read the ledger.** Change
`computeMemberNetBalances` (and anything built on it) to subtract completed
`SplitRequest` amounts from each payer's net position, instead of reading
`Split.amountPaidCents`. `Split.amountOwedCents` keeps meaning exactly what
it means today — an expense share — it's just never mutated after creation
anymore. (Whether the now-unused `amountPaidCents`/`settledAt` fields get
removed from the model is a smaller, separate cleanup — not blocking, and
safer to defer until the new path has proven out; see "decisions" below.)

**C. A shared ledger/transaction-history view.** One component, not two:
a chronological list mixing expenses (debits) and payments (credits) for a
pair or a scope, with a running balance — replaces trip's `SettlementRow`
per-split badges, `ExpenseDetailScreen`'s per-split settled badge, and
group's binary settled badge, all at once. This is also where "record a
payment" gets its UI — an amount-entry action, not a "mark paid" toggle.

**D. Retire the two wholesale-exclusion filters** in `computeGroupBalances`.
A trip could still be marked "closed" for organizational reasons (hide it
from "active trips," stop new expenses landing on *it* specifically) without
its unpaid debts silently disappearing from the group ledger. **This is a
real behavior change**, not a refactor: today, closing a trip makes its
debts vanish from the group view; after this change, they'd persist until
actually paid down. Worth being deliberate about, since anyone currently
relying on "close trip = debts gone" would see different behavior. Unchanged
from the original analysis — this gap and its risk exist under either model,
and is if anything easier to reason about now, since there's no separate
"what happens to the overpayment" question sitting next to it.

**E. Reconcile the bulk "settle everything" action.** `useSettleAllGroupDebts`
today marks every active expense fully settled and closes every active trip
in one shot. Under the ledger model this becomes a thin convenience wrapper
around (A): record a completed payment for each pair's full net balance.
Same mechanism as an individual payment, not a separate code path.

**F. Actually moving money** (Stripe / Open Banking / Wero) is a separate
concern from *recording* that a payment happened, and is already flagged in
`trip-group-unification-analysis.md` as its own initiative — two
incompatible abstractions (`IPaymentMethodRegistry` vs `IPaymentService`)
sit underneath trip and group payments respectively. This ledger work
doesn't need to wait on that: "record a manual payment" is independent.
"Let someone pay via Stripe and have it auto-record" is not, and would pull
that unification in as a dependency. Unchanged from the original analysis.

## Decisions baked into this plan, flagged so they're easy to override

1. **Reuse `SplitRequest` as the ledger entry, relaxing `tripId` to
   optional and adding `groupId?`.** No rename, no new model — it already
   has the right shape (payer, payee, amount, status, timestamp).
2. **Only `SplitRequest` rows with a completed status (`paid`/`completed`)
   count as ledger credits.** In-flight or failed statuses don't move the
   balance — this falls directly out of the model's existing enum, not a
   new rule invented for this feature.
3. **`Split.amountPaidCents`/`settledAt` stop being written, but the fields
   stay in the model for now rather than being removed.** Safer to prove
   the new path out first; removing the fields (and any code still reading
   them) is a smaller follow-up cleanup, not part of this build.
4. **Both trip and group move to the ledger model — this was a scope
   decision, not a default.** Confirmed explicitly: forking the calculation
   into a trip-specific and group-specific version was rejected in favor of
   one shared model, even though it means trip's existing Settle screen
   changes too.
5. **Per-expense "settled" granularity is dropped entirely, in favor of the
   ledger/transaction-history view.** Also confirmed explicitly, over the
   alternative of keeping a best-effort, non-authoritative "looks settled"
   badge computed via display-only oldest-first allocation.

## Still open, deliberately deferred

- **What "closing" a trip or an expense means, if anything, once it no
  longer hides debt.** Purely organizational (hide from "active," block new
  expenses landing on it) is the obvious candidate, but this doc doesn't
  resolve it — it only insists that whatever it means, it can't be a
  mechanism that makes real debt disappear from the ledger.
- **The exact shape of the ledger/transaction-history view** — chronological
  list design, how a running balance is displayed alongside it, whether
  trip and group versions of the screen differ in anything beyond scope.
  Worth a mockup or two before committing to a layout.
- **Removing the now-dead `Split.amountPaidCents`/`settledAt` fields**
  entirely, once the ledger path has been live for a while.

## Sizing and risk, piece by piece

- **(A)** is small — one function, no allocation logic, genuinely simpler
  than the oldest-first design in the original analysis.
- **(B)** is a change to a well-tested, central function
  (`computeMemberNetBalances`) — needs care and thorough tests, but is a
  swap of *what* gets summed on the credit side, not a new algorithm.
- **(C)** is the largest single piece — a new shared UI component replacing
  three existing pieces of settle/badge UI across both trip and group.
- **(D)** is small in code size but is a real behavior change to what
  "closing a trip" means today. Needs an explicit decision from you, not
  just an engineering call.
- **(E)** is a thin wrapper once (A) exists.
- **(F)** stays out of scope, consistent with the earlier unification
  analysis.

## If you want to proceed, suggested order

1. Build (A) + (B) together — the ledger-entry primitive and the
   net-balance calculation change are tightly coupled and worth landing as
   one reviewable unit, with thorough unit tests (exact payment, overpayment
   going negative, a later expense netting correctly against a leftover
   credit, a payment with no prior debt at all).
2. Build (C), wired up to trip first (existing UI scaffolding, and this is
   also where the dead "Mark Paid" button finally gets fixed).
3. Bring (D)'s behavior change to you explicitly before landing it.
4. Extend (C) to group, reusing the same primitive and, as much as possible,
   the same component.
5. Build (E) once (A)–(D) exist.
