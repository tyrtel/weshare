# UI Improvements — tracking

Generated from UI best-practices audit.  App name mismatch (WeShare/ouiShare) intentionally excluded — dual-brand strategy.

## Status key
- [ ] not started
- [~] in progress
- [x] done

---

## 1. Raise `text.tertiary` contrast  [x]
**Files:** `src/theme/colors.ts`
Dark `#5a5a7a` → `#7a7a99` (~3.7:1); Light `#9ca3af` → `#7b8299` (~3.6:1).  Fixes WCAG failure for inactive tab icons and caption text.

## 2. Replace hardcoded hex values with theme tokens  [x]
**Files:** `src/components/ui/UniversalTabBar.tsx`, `src/components/ui/AppLoadingScreen.tsx`, `app/_layout.tsx` (ErrorBoundary)
All raw hex strings moved to `useColors()` calls or direct `darkColors.*` imports.  Also fixed `colors.primary.muted` typo in `GroupCard.tsx` → `primary.subtle`.  Added `expo-haptics` mock to `jest.config.js` to prevent future test gaps.

## 3. ExpenseFormScreen — progressive disclosure on split section  [x]
**Files:** `src/features/expenses/screens/ExpenseFormScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`
Split toggle hidden by default; shows "Split equally" + "Customize…" link.  In edit mode, starts expanded.  Reveals toggle when any non-equal mode is active.

## 4. FAB discoverability — pulse attention animation  [x]
**Files:** `app/(tabs)/index.tsx`
`withSequence` scale-pulse (1 → 1.14 → 1) fires 900 ms after mount using `fabAttentionStyle`.  Sub-action pills already had text labels.

## 5. Avatar touch targets — add hitSlop to tappable avatar wrappers  [x]
**Files:** `src/features/expenses/components/PayerSelector.tsx`
Added `hitSlop={4}` to the Pressable wrapping md-size (36px) avatars, bringing effective tap target to ≥44pt.

## 6. Unify creation-flow presentation to modal  [x]
**Files:** `app/_layout.tsx`
Added `presentation: 'modal'` to `expense/add`, `expense/edit`, and `trip/edit` Stack.Screen declarations.

## 7. Haptics on settle and close-trip actions  [x]
**Files:** `src/features/settlement/screens/SettlementScreen.tsx`, `src/features/settlement/__tests__/SettlementScreen.test.tsx`
`handleCloseTrip` now fires `Haptics.notificationAsync(Success)` before calling `closeTrip()`.  The "All settled" bar routes through `handleCloseTrip` (was inline).  Test mock updated to include `notificationAsync` + `NotificationFeedbackType`.

## 8. TripActivityScreen — virtualize the expense list  [x]
**Files:** `src/features/trips/screens/TripActivityScreen.tsx`
Converted from `ScrollView` + `expenses.map()` to top-level `FlatList` with `ListHeaderComponent` (back button, total-spend card, pie chart, section label).  Eliminates layout thrash on long trips.

## 9. `numberOfLines` truncation in list rows  [x]
**Files:** `src/features/settlement/components/SettlementRow.tsx`
Added `numberOfLines={1}` to the debtor and creditor first-name caption cells.  TripCard, ExpenseRow, GroupCard, and BalanceSummaryScreen were already covered.

---

## Pass 2 — additional items from second analysis

## 10. GroupCard localization — balance label & subtitle  [x]
**Files:** `src/features/groups/components/GroupCard.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`
`balanceLabel` uses raw template strings (`You owe …`, `You're owed …`, `All settled`). Subtitle member/trip count uses hardcoded English pluralisation.  Replace with `t()` calls and i18next plural keys.

## 11. Stack screenOptions — 2 remaining hardcoded hex values  [x]
**Files:** `app/_layout.tsx`
`backgroundColor: '#16213e'` and `headerTintColor: '#e8e8f5'` missed in first pass.  Replace with `darkColors.surface` and `darkColors.text.primary`.

## 12. Forgot-password link touch target  [x]
**Files:** `app/auth/index.tsx`
`paddingVertical: 4` gives ~19 px total height, well below 44 pt.  Change to `paddingVertical: 12`.

## 13. Auth screen logo — emoji → app icon asset  [x]
**Files:** `app/auth/index.tsx`
`✈️` emoji rendered inside a styled box.  Replace with `<Image source={require('../../assets/icon.png')} />` to match `AppLoadingScreen`.

## 14. Invalid `Text variant="heading"`  [x]
**Files:** `app/auth/index.tsx`, `app/auth/signup.tsx`
`"heading"` is not in the `TypographyVariant` union; `typography["heading"]` returns `undefined`, silently dropping font styles.  Valid values are `heading1`, `heading2`, `heading3`.  Remove the invalid prop (inline styles already provide full styling).

## 15. Password visibility toggle  [x]
**Files:** `app/auth/index.tsx`, `app/auth/signup.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`
`secureTextEntry` with no show/hide button on sign-in and sign-up screens.  Add eye-icon `Pressable` inside each password field with `showPassword` / `showConfirm` state.

## 16. `visibleExpenses` — add `useMemo`  [x]
**Files:** `src/features/trips/screens/TripDetailScreen.tsx`
`expenses.slice(0, 3)` runs on every render, creating a new array reference and triggering unnecessary FlatList updates.  Wrap with `useMemo([expenses, showAllExpenses])`.

## 17. Home screen pull-to-refresh  [x]
**Files:** `src/features/groups/hooks/useGroups.ts`, `app/(tabs)/index.tsx`
The main `SectionList` has no `RefreshControl`.  Add `refetch` to `useGroups`, then wire `RefreshControl` into the home screen's `SectionList`.

## 18. `Button` component — add `loading` prop and adopt in RolloverScreen  [x]
**Files:** `src/components/ui/Button.tsx`, `src/features/settlement/screens/RolloverScreen.tsx`
`Button` exists with spring animation and accessibility but is used nowhere.  Add `loading` prop (shows `ActivityIndicator`), then replace the custom `Pressable` in `ConfirmStep` with `<Button>`.

---

## Ledger Skin — user-selectable second theme

Packages derived from `docs/ledger-theme-analysis.md`.  All packages (L1–L10) complete.

## L1. Token layer  [x]
**Files:** `src/theme/colors.ts`, `src/theme/tokens.ts`, `src/theme/index.ts`
`ledgerColors` palette (mist bg, paper surface, ink text, spruce primary, owed green, owes coral, butter dot).  `ledgerRadius` (sm/md/card/xl/pill) and `ledgerShadow.card`.  All exported from `src/theme/index.ts`.

## L2. ThemeContext + theme toggle  [x]
**Files:** `src/core/ThemeContext.tsx`, `app/_layout.tsx`, `app/(tabs)/balance.tsx`
`ThemeProvider` wraps the app.  Persists choice to `expo-secure-store`.  Hooks: `useActiveTheme()`, `useSetTheme()`, `useThemeColors()`.  Default/Ledger toggle added to the balance tab header.

## L3. Typography — Space Grotesk + Inter fonts  [x]
**Files:** `app/_layout.tsx`, `src/theme/tokens.ts`, `src/components/ui/Money.tsx`, ledger screens and components
Installed `@expo-google-fonts/space-grotesk` (SemiBold + Bold) and `@expo-google-fonts/inter` (Regular + Medium + SemiBold).  `useFonts()` wired in `RootLayout`; blocks render until loaded.  `ledgerFonts` token map added to `tokens.ts`.  `Money` primitive (SpaceGrotesk-Bold, tabular-nums).  Applied in `LedgerBars`, `BalancePill`, hero amounts on Home/Group/Trip/Expense ledger layouts, and auth screen app name.

## L4. New shared UI components  [x]
**Files:** `src/components/ui/LedgerBars.tsx`, `src/components/ui/BalancePill.tsx`, `src/components/ui/Segmented.tsx`, `src/components/ui/ActivityDot.tsx`, `src/components/ui/index.ts`
`LedgerBars` — diverging bar chart (green right / coral left, animated).  `BalancePill` — signed balance badge with color semantics.  `Segmented` — pill-style tab switcher.  `ActivityDot` — 6px butter circle.

## L5. Home screen ledger layout  [x]
**Files:** `app/(tabs)/index.tsx`
Conditional `isLedger` branch.  Hero header with overall net position (sum of groupSummaries).  Trip cards with Unsettled coral pill.  Group cards with emoji tile, ActivityDot, BalancePill.  Ledger FAB + speed-dial.

## L6. Group detail screen ledger layout  [x]
**Files:** `app/group/[id].tsx`
Conditional `isLedger` branch.  Title row with back/emoji/name/settings.  Balances card with LedgerBars + Settle up button.  Trip rows, expense rows with icon tiles.  Members section with avatar chips + invite link chip.  FAB speed-dial preserved.

## L7. Trip detail screen ledger layout  [x]
**Files:** `src/features/trips/screens/TripDetailScreen.tsx`
Conditional `isLedger` branch.  Stat strip card (Trip total / Per person / Your net).  LedgerBars below stat strip.  Settle trip button.  Participants avatar row + dashed-border invite circle.  Icon tile expense list.

## L8. Add expense screen ledger layout  [x]
**Files:** `src/features/expenses/screens/ExpenseFormScreen.tsx`
Conditional `isLedger` branch.  Large centered amount + title card.  Payer avatar chips.  Segmented split mode control (Evenly / Shares / Exact / Items).  All four split mode panels.  Full-width Save button.  Existing default form untouched.

## L9. Auth screen ledger skin  [x]
**Files:** `app/auth/index.tsx`
Mist background, paper card for the form section (white bg, ledgerRadius.card, shadow), spruce primary button, ledger border colors on inputs and social buttons.  All auth flows (email, Google, Apple) and business logic unchanged.

## L10. Balance view toggle  [x]
**Files:** `src/core/hooks/useBalanceView.ts`, `src/components/ui/BalanceViewSelector.tsx`, `app/group/[id].tsx`, `src/features/trips/screens/TripDetailScreen.tsx`
Zustand store (`useBalanceView`) holds separate `group` and `trip` view mode preferences — persists across navigation within a session.  `BalanceViewSelector` shared component renders the `Segmented` toggle (Bars/List/Bubbles) above the selected view: Bars = LedgerBars, List = avatar + name + signed amount rows (Inter Medium / SpaceGrotesk SemiBold), Bubbles = scrollable avatar circles with colored ring borders and amount labels.  Both screens wired to their respective store slice.
