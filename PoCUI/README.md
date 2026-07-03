# Even — expense-split UI design kit (Expo / React Native)

A runnable design kit for a modern expense-splitting app: five screens, one shared design language, mock data. Drop it into a fresh Expo project and it runs on Android/iOS out of the box.

## The "Ledger" design language

The identity is built around an accountant's ledger, because the app's entire job is answering one question fast: *who owes whom, and how much?*

**Palette** (all tokens in `src/theme.ts`)

| Token | Hex | Role |
|---|---|---|
| Ledger ink | `#182420` | Text — green-black, like ledger ink |
| Mist | `#F2F5F1` | App background |
| Paper | `#FFFFFF` | Cards and the receipt |
| Spruce | `#0E6B4F` | Primary actions only |
| Owed green | `#12946A` | Money coming to you |
| Owes coral | `#D9532B` | Money you owe |
| Butter | `#F2C94C` | Activity indicator dot, nothing else |

Balance semantics are carried by exactly two hues, everywhere — pills, bars, headers. Once learned on the home screen, it reads instantly on every other screen.

**Type.** Space Grotesk for display text and *all* money (always with `tabular-nums`, so amounts align in columns like a printed statement); Inter for body and labels. Loaded via `@expo-google-fonts`.

**Signature element №1 — LedgerBars.** A diverging bar chart with a central spine: debts extend left in coral, credits right in green, all on one shared scale. It appears compact on group cards on the landing page, and full-size (with avatars and amounts) on group and trip screens — same visual grammar at both zoom levels, so drilling down feels continuous.

**Signature element №2 — the receipt.** The itemized split mode is styled as an actual paper receipt: centered uppercase header, dotted leader lines between item and price, dashed tear lines, per-person subtotals in the footer. Tap an item's assignee chips to toggle who had it; shared items divide automatically ("€10.50 each"), and unassigned items block saving.

## Screens

- **AuthScreen** — Apple / Google / magic-link email. No password field by design.
- **HomeScreen** — the landing page. One big number (your overall net position), active/unsettled trips, then groups. Each group card shows a butter-dot latest-activity line, your net balance pill, and a compact LedgerBars preview.
- **GroupScreen** — full balances viz with Settle up / Remind, recurring expenses (rent, internet) with cadence, trips belonging to the group, one-off expenses, and member chips with an invite-link chip.
- **TripScreen** — stat strip (total / per person / your net), LedgerBars, participant row with a dashed "Invite" circle that opens the native share sheet with a deep link (`https://even.app/j/t/:tripId`), and the expense list labeled by split mode. Includes `tripBalances()` / `expenseShares()` showing the settlement math for all four split modes (integer cents, remainder-safe rounding).
- **AddExpenseScreen** (modal) — amount + title, payer chips, and a segmented control across the four split modes:
  - **Evenly** — checkbox rows with live per-head share
  - **Shares** — weight steppers with % and amount
  - **Exact** — per-person inputs with a "left to assign" tally that must reach zero
  - **Items** — the receipt

## Run it

```bash
npx create-expo-app even-ui --template blank-typescript
cd even-ui
npx expo install @react-navigation/native @react-navigation/native-stack \
  react-native-screens react-native-safe-area-context \
  @expo-google-fonts/space-grotesk @expo-google-fonts/inter \
  expo-font expo-status-bar @expo/vector-icons
# copy App.tsx and src/ over the template, then:
npx expo start
```

## Wiring it into your real app

- Amounts are **integer cents** end to end; `fmtMoney` is the only place formatting happens. Swap `€`/locale there.
- `src/data/mock.ts` defines the domain types (`Group`, `Trip`, `Expense`, `Split`, `ReceiptItem`). Replace the fixtures with Zustand selectors backed by Supabase; the screens only read plain objects, so the swap is mechanical.
- `expenseShares()` in `TripScreen.tsx` is the canonical split→shares function. In production, move it to a shared module and mirror it in a Supabase function/trigger so server and client agree on rounding.
- Deep links are configured in `App.tsx` (`even://` + `https://even.app` universal links). Add an interstitial "Join trip" screen behind `j/t/:tripId` that validates the invite code before inserting the participant.
- The receipt's perforated edge is a plain View placeholder — replace with an SVG zigzag (`react-native-svg`) for crisp tear lines.
- For polish passes: animate LedgerBars widths with Reanimated (`withSpring` on mount), and use `LayoutAnimation`/`entering` transitions when toggling receipt assignees.
