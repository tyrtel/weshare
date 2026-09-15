# Itemization UI Redesign — DONE (2026-09-13)

All items below are implemented; full suite green (125/125 suites, 1507/1507
tests), lint clean.


## Goal

Decouple itemized-split entry from the top-level expense amount, relocate the
entry point into the amount/description card, and make the itemized editor
UI pluggable for future alternate designs.

## Decisions (confirmed with user, 2026-09-13)

1. **Split math**: item amounts stay literal dollar splits (not proportional
   weights). The amount field is always independently editable. Reconciliation
   (item sum === total) is enforced at save time via `splitIsValid`, the same
   way "Exact" mode already requires `remainder === 0` — no more live
   auto-sync of the amount field to the running item total.
2. **Assignment location**: item entry (description/amount) and per-item
   member assignment merge into one UI, opened from a single button. Step 2's
   split section becomes a read-only recap of the resulting split.
3. **Scope**: both add and edit flow get the new button + sheet. (Edit mode's
   amount field was already independently editable — only its item-editing
   surface moves.)
4. **Pluggability**: one shared props contract (`ItemizedSplitEditorProps`) +
   a local keyed component registry. No DI container involvement — this is
   presentation-only, no prod/mock split.

## Architecture

```
src/features/expenses/components/itemization/
  types.ts                     — ItemizedSplitEditorProps contract
  ClassicItemizedSplitEditor.tsx — today's list UI (entry + assignment), implements the contract
  registry.ts                  — ITEMIZED_SPLIT_EDITORS keyed map + DEFAULT_ITEMIZED_SPLIT_EDITOR
  ItemizedSplitSheet.tsx       — modal wrapper (header, reconciliation footer, renders registry[key])
```

A future "flashier" editor is a second component satisfying
`ItemizedSplitEditorProps`, added to the registry under a new key — no
changes needed to `ExpenseFormScreen`, `SplitModeSection`, or the sheet.

## Changes

- [x] `useSplitForm.ts`: unify `remainder`/`splitIsValid` — drop the
      itemized-specific `remainder = 0` special case; itemized now requires
      `remainder === 0` (item sum reconciles with `totalAmountCents`) same as
      custom mode, in addition to "every item assigned".
- [x] New `itemization/` module (types, ClassicItemizedSplitEditor, registry,
      ItemizedSplitSheet) — merges `LineItemEntryList` (entry) and
      `SplitModeSection`'s old editable-itemized branch (assignment) into one
      editor, plus a reconciliation footer.
- [x] `ExpenseAmountCard.tsx`: drop the `editable:false` running-total
      branch — amount is always a plain editable field now.
- [x] `ExpenseFormScreen.tsx`:
  - remove `LineItemEntryList` usage and the old toggle/reset logic
    (`handleToggleItemized`, the `handleContinue` total-sync)
  - `enteredTotal` always equals `totalAmountCents` (no itemized branch)
  - new items button rendered in both add and edit mode, opens
    `ItemizedSplitSheet`
  - `splitModes` gating unified: `itemized` offered whenever
    `lineItems.length > 0`, for both add and edit (previously edit always
    offered it even with zero items)
- [x] `SplitModeSection.tsx`: itemized branch becomes read-only recap only
      (drop `itemsEditable`, `itemRaw`/`setItemRaw` props, inline add/remove/
      assign controls); add a tap-to-edit affordance that reopens the sheet.
- [x] Delete `LineItemEntryList.tsx` (fully absorbed into
      `ClassicItemizedSplitEditor`).
- [x] i18n: add sheet title/done/clear-items keys to `en.json` + `fr.json`,
      symmetrically. Drop `single_amount_instead` (no longer reachable).
- [x] Tests: rewrite the "Itemized mode" and "Two-step flow" blocks in
      `ExpenseFormScreen.test.tsx` for the new button→sheet flow; add
      itemized `remainder`/`splitIsValid` cases to `useSplitForm.test.ts`;
      add a focused test file for the registry/sheet if warranted.
- [x] Full suite green (`npm test`).

## Explicit judgment calls made along the way (flagged for review)

- testID `expense-itemize-toggle` renamed to `expense-items-button` (behavior
  changed from toggle to open-sheet, old name was misleading).
- No dedicated "single amount instead" affordance — removing all items via
  the sheet's per-item remove (or a "Clear items" action inside it) is the
  only path back to zero items, since amount and items are independent now.
