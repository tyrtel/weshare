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
