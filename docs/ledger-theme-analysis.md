# "Ledger" Theme — Reskin Analysis

This document compares the PoCUI ("Even / Ledger" design language) against the existing WeShare UI and breaks down every change required to ship it as a user-selectable second theme. Features are preserved throughout; the analysis separates what is a pure token swap, what requires new components, and what requires screen layout rewrites.

---

## Executive summary

A clean, feature-complete Ledger theme is achievable in roughly **3–4 weeks** of focused work. About 30% of it is pure token substitution (colors, radii, shadows). The remaining 70% splits evenly between three new shared components (LedgerBars being the centrepiece) and screen-level layout rewrites for five screens. No business logic, hooks, store, test, or DI layer needs to change.

The one thing that cannot be a pure reskin is the **auth screen**: the PoC is passwordless by design; WeShare already has email/password users. The auth layout can adopt the Ledger visual style, but the email/password and OTP flows must be kept.

---

## The switching mechanism

Before any screen work, a `ThemeContext` wraps the app and exposes a `theme: 'default' | 'ledger'` value. Both `useColors()` and the token constants become theme-aware — they read the active theme from context and return the matching palette. This is the only architectural addition. All hooks, services, store, and navigation stay completely unchanged.

Persistence: the user's choice is saved to `expo-secure-store` on change and rehydrated in `_layout.tsx` before first render, so there is no flash of the wrong theme on cold start.

Implementation: one new `ThemeContext.tsx`, a `useLedgerColors()` alias (or a generic `useColors()` that dispatches on the active theme), and a settings toggle in the profile/settings screen.

---

## What is a pure token swap

These changes live entirely in `src/theme/` and `src/i18n/` — no screen code changes.

### Color palette

| Role | Default (current) | Ledger |
|------|------------------|--------|
| App background | `colors.background` | `#F2F5F1` (mist) |
| Card background | `colors.surface` | `#FFFFFF` (paper) |
| Primary text | `colors.text.primary` | `#182420` (ink) |
| Secondary text | `colors.text.secondary` | `#5C6B63` (inkSoft) |
| Tertiary / placeholder | `colors.text.tertiary` | `#95A29B` (inkFaint) |
| Primary action | `colors.primary.default` | `#0E6B4F` (spruce) |
| Primary pressed | `colors.primary.pressed` | `#0A4A38` (spruceDeep) |
| Primary tint / chip bg | `colors.primary.subtle` | `#E2F1EA` (spruceTint) |
| Success / owed | `colors.success.default` | `#12946A` |
| Success tint | `colors.success.bg` | `#DDF2E9` (owedTint) |
| Error / owes | `colors.error.default` | `#D9532B` |
| Error tint | `colors.error.bg` | `#FBE7DE` (owesTint) |
| Hairline / divider | `colors.border` | `#E4EAE3` (line) |
| Strong divider | `colors.borderMuted` | `#CBD5CD` (lineStrong) |
| New: activity dot | — | `#F2C94C` (butter) |

### Border radii

| Token | Default | Ledger |
|-------|---------|--------|
| `radius.sm` | current value | 10 |
| `radius.md` | current value | 14 |
| `radius.card` | current value | 20 |
| `radius.xl` | current value | 28 |
| `radius.pill` | 999 | 999 |

### Shadows

The PoC uses a single card shadow: `shadowColor: #182420, shadowOpacity: 0.06, shadowRadius: 12, offset: (0, 4), elevation: 2`. The current `tokens.shadow.md` and `tokens.shadow.lg` are updated to match.

### Icon set

The PoC uses **Feather** icons exclusively; WeShare uses **Ionicons**. Both are in `@expo/vector-icons` — no new package required. A one-time mapping is needed across ~40 icon references in the app. Most have direct equivalents (`receipt-outline` → `file-text`, `airplane-outline` → `send`, `repeat-outline` → `repeat`, `person-add-outline` → `user-plus`, etc.). The icon set swap is a find-and-replace pass with a translation table; it touches many files but each change is trivial.

---

## Typography — a moderate addition

The PoC is built on two custom fonts: **Space Grotesk** (display text and all money amounts) and **Inter** (body copy and labels). WeShare currently uses the system font stack.

**What needs to happen:**

```
npx expo install @expo-google-fonts/space-grotesk @expo-google-fonts/inter expo-font
```

Add font loading to `app/_layout.tsx` using `useFonts()`. While fonts load, show the existing splash screen (already in place). Once loaded, fonts are available globally.

Font mapping:

| Usage | PoC | Default |
|-------|-----|---------|
| Display / screen titles | SpaceGrotesk 700 Bold | system bold |
| Display medium / subheads | SpaceGrotesk 500 Medium | system semibold |
| Money amounts | SpaceGrotesk 500 + `tabular-nums` | system mono or default |
| Body copy | Inter 400 Regular | system regular |
| Body medium | Inter 500 Medium | system medium |
| Body semibold / labels | Inter 600 SemiBold | system semibold |

The `tabular-nums` variant on money is significant — it makes amounts align in columns, which is the whole point of the ledger aesthetic. This is a one-line addition to any component that renders a currency amount: `fontVariant: ['tabular-nums']`.

---

## New shared components required

These are net-new additions to `src/components/ui/` (or `src/features/groups/components/`). They do not replace existing components — they live alongside them and are used only by Ledger-theme screens.

### 1. LedgerBars

**The signature element.** A diverging bar chart with a central spine: balances that the group owes someone extend right in green; balances that person owes the group extend left in coral. Both sides share one scale, so debt magnitude is readable at a glance.

The PoC component (`LedgerBars.tsx`) is self-contained and already written. Wiring it into WeShare requires:

- Input: `balances: Record<userId, number>` and `members: GroupMember[]` — both are already in the Zustand store
- A `compact` prop for the small preview on group cards (same component, smaller margins)
- Animating bar widths with `withSpring` on mount (Reanimated, already a dependency)

The balance calculation itself already exists in `computeGroupBalances` and the trip settlement logic. LedgerBars just consumes those outputs.

**Appears on:** HomeScreen (group card compact preview), GroupScreen (full-size with names + amounts), TripScreen (full-size).

### 2. BalancePill

A pill-shaped badge showing the current user's net balance in a group: green-tinted for positive, coral-tinted for negative, with `tabular-nums` formatting. The existing `Badge` component is close but needs the color-semantic + tabular-nums treatment.

### 3. Segmented (split mode control)

The PoC's split mode selector is a segmented control (Evenly / Shares / Exact / Items) rather than the existing pill-button row. The underlying split logic is identical — only the control's visual treatment changes. This is a new `Segmented` component (already fully written in `ui.tsx` from the PoC) that wraps the existing `split.handleSetMode` callback.

### 4. Money (tabular display primitive)

A text primitive that always renders with `SpaceGrotesk_500Medium` + `fontVariant: ['tabular-nums']` + color-semantic sign display. The existing `formatCurrency` utility is reused unchanged; this is only a display wrapper.

### 5. Activity dot

A 6px butter-colored circle (`#F2C94C`) used on group cards to indicate recent activity. Trivial to add; mentioned separately because it introduces the only use of the butter token.

---

## Screen-by-screen layout changes

These are the screens that require more than a token swap. In every case the underlying hooks, data, and navigation remain identical — only the JSX layout changes.

### Home screen (`app/(tabs)/index.tsx` or equivalent)

**Current:** tab bar entry showing trips list and groups list, no overall net position hero.

**Ledger target:**
- Hero header: "Overall, you're" + large signed net amount in green/coral + "ahead" / "behind" in SpaceGrotesk. Net position = sum of the user's balance across all groups. This computation is already available through the Zustand store's balance selectors.
- Trips section: card showing emoji, name, dates, expense count, avatar stack, "Unsettled" coral pill (butter dot replaced by pill on trip cards, butter dot reserved for group cards).
- Groups section: card showing emoji tile, group name, butter activity dot + last activity text, compact LedgerBars preview, BalancePill.
- Single FAB (+ icon) replacing the speed-dial. The PoC has one global FAB; the group detail speed-dial could be kept on the group screen, or simplified. This is the one UX decision to make — whether to keep the speed-dial on the group screen or collapse to a single context-aware FAB. Either works; keeping the speed-dial is lower risk.

**Effort: moderate.** New layout, but all data is already in the store.

### Group detail screen (`app/group/[id].tsx`)

**Current:** member avatar row at top, scrollable list of trips and expenses below, FAB speed-dial.

**Ledger target:**
- Title row: back chevron + `{emoji}  {name}` in SpaceGrotesk + settings gear (matches current edit button)
- **Balances card:** full LedgerBars with "BALANCES" uppercase label, then a hairline, then "Settle up" (primary) + "Remind" (ghost) buttons side by side. This replaces the current balance amount rows.
- **Recurring section:** icon tile (spruce tint bg, feather icon in spruce) + title + cadence badge. This is very close to the existing recurring expense list items — mainly an icon tile and font change.
- **Trips section:** same data, card style updated.
- **Expenses section:** icon tile + title + payer/date meta + amount. Same data as `GroupExpenseCard`, different icon and font treatment.
- **Members section:** chip row (avatar circle + name) + "Invite link" chip (spruceTint bg, link icon). This replaces the current avatar stack at the top of the screen.

**Effort: moderate-significant.** Most sections exist; the layout of each needs rewriting. LedgerBars replaces the balance text display.

### Trip detail screen (`app/trip/[id].tsx` or equivalent)

**Current:** trip info, expense list.

**Ledger target:**
- Title + dates row
- **Stat strip card:** Trip total / Per person / Your net — three stats separated by vertical hairlines. Per-person is `Math.round(total / participantCount)`. Your net = existing settlement math.
- **LedgerBars** in the stat card below the hairline.
- **Settle trip** button.
- **Participants row:** avatar circles with name below, plus a dashed-border circle "Invite" button that calls the existing share/invite flow. The dashed-border circle is a simple `borderStyle: 'dashed'` view.
- **Expense list:** icon tile + title + payer + split mode label + date. The split mode label (`split evenly`, `split by shares`, `exact amounts`, `itemized`) is a display addition; the mode is already on the expense model.

**Effort: moderate.** The stat strip and LedgerBars are new. Everything else is a layout rework of existing data.

### Add expense screen (`app/group/expense/add.tsx` / `ExpenseFormScreen`)

This is the biggest delta. The PoC treats it as a **modal** (presented from the bottom, X button to dismiss) rather than a pushed navigation screen.

**Current:** full pushed screen, description field first, then amount, then category, then payer selector, then split section, then save button in header.

**Ledger target:**
- Modal presentation (already possible via `router.push` with `presentation: 'modal'` in the route config — no structural change required)
- **Amount + title card:** huge centered amount input (`fontSize: 44`, SpaceGrotesk) above a centered title input, both in one card. The current `AmountInput` component handles the number; the layout changes around it.
- **Payer chips:** horizontal scrollable row of chips (avatar + name), active chip fills spruce. The existing `PayerSelector` implements the same selection logic; this is a visual replacement.
- **Segmented split mode control:** replaces the existing pill-button row. Same four modes (equal / proportional / custom / itemized), same underlying `useSplitForm` hook.
- **Even mode:** checkbox rows (square rounded checkbox, avatar, name, live per-head amount). Close to existing `SplitMemberRow` — new checkbox visual.
- **Shares mode:** avatar, name + "N shares · X%" meta, amount, +/− stepper. The stepper replaces the existing weight slider/input. Existing `proportional` mode maps directly.
- **Exact mode:** avatar, name, amount text input, "Left to assign" tally. Maps to existing `custom` mode. The tally already exists as `split.remainder`.
- **Items (receipt) mode:** this is the most distinctive element. The receipt visual — centered uppercase merchant name, dotted leader lines between item label and price, dashed tear lines above/below, per-person footer — wraps the existing `LineItemRow` list in a paper card with different styling. The underlying `split.lineItems` and `split.toggleMemberInItem` hooks are unchanged.
- **Save button:** full-width PrimaryButton at the bottom (currently a header button).

**Effort: significant.** This screen needs the most visual work. The business logic (hooks, validation, submission) is entirely unchanged; only the JSX layout is rewritten.

### Auth screen

Layout can adopt Ledger colors and typography. The passwordless-only design of the PoC cannot be adopted — email/password and OTP flows must be preserved. The Ledger auth screen would be: mist background, paper card for the input area, spruce primary buttons, Space Grotesk headings. The flow itself stays unchanged.

**Effort: light.** Token swap + font update. No flow changes.

---

## Visualization options within screens (bubbles vs. line items vs. bar graph)

The user mentioned the ability to switch between these three within the group/trip screens. This is a separate, smaller feature that sits on top of the theme system.

The group and trip screens currently show balances as a plain list of amounts (text-based). The Ledger theme adds LedgerBars as the default visualization. A per-screen toggle could let the user switch between:

- **Bubble/avatar view** — the current avatar row with balance amounts next to names
- **Line items** — the current text list, amounts aligned
- **Bar graph** — LedgerBars (new)

Implementation: a `balanceView: 'bubbles' | 'list' | 'bars'` preference in the store (or AsyncStorage), toggled by a small segmented control or icon row at the top of the balances section. All three views read from the same `memberBalances` selector — only the rendering component changes. This is ~2 days of work independent of the theme.

---

## Summary of work packages

| Package | Contents | Estimate |
|---------|----------|----------|
| Token layer | Colors, radii, shadows, icon mapping table | 2 days |
| Typography | Font install, font loading in `_layout.tsx`, `Money` primitive, tabular-nums pass | 1 day |
| Theme switching | `ThemeContext`, settings toggle, SecureStore persistence | 1 day |
| New components | LedgerBars (animated), BalancePill, Segmented, activity dot | 3 days |
| Home screen | Hero text, trip cards, group cards with compact LedgerBars | 2 days |
| Group detail screen | Balances card + LedgerBars, recurring/expense/member layout | 3 days |
| Trip detail screen | Stat strip, LedgerBars, dashed invite circle | 2 days |
| Add expense screen | Modal, amount card, payer chips, split mode layouts, receipt visual | 4 days |
| Auth screen | Token/font update only | 0.5 days |
| Balance view toggle | Bubbles / list / bars toggle on group + trip screens | 2 days |
| **Total** | | **~20 days** |

---

## What does NOT change

- All DI tokens, interfaces, and service implementations
- All Zustand store actions and selectors
- All hooks (`useCreateGroupExpense`, `useRecurringExpenses`, `useSettleGroupExpense`, etc.)
- All Expo Router navigation structure and deep links
- All Supabase migrations and edge functions
- All tests (947 passing today; the theme layer is never in test scope)
- All i18n strings
- Auth flows (email/password, Google, Apple, guest, OTP)
- Payment flows (Stripe, open banking)

The theme is a rendering concern only. The entire application layer beneath `app/` and `src/features/*/screens/` is untouched.

---

## Recommended sequencing

1. Ship token layer + ThemeContext first — this gives you a togglable structure with the right colors even before any screen is ported.
2. Build LedgerBars in isolation with a demo fixture so it can be reviewed standalone.
3. Port screens in dependency order: Home → Group detail → Trip detail → Add expense.
4. Add the balance-view toggle as a late pass once the bar graph component is stable.
5. Font loading last, since it is the riskiest dependency (cold-start timing) — add it once everything else works with system fonts.
