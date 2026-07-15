# ouiShare — Feature Specification for UI Design

**App:** ouiShare  
**Platforms:** Android, iOS  
**Languages:** English, French  
**Themes:** Default (light/dark), Ledger (dark navy/gold)

---

## 1. Navigation Structure

### Tab bar (always visible except on auth and join screens)
| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/` | Groups + standalone trips list |
| Balance | `/balance` | Your net balance across active trips |

### Modal / stack screens (push navigation)
Auth, Group CRUD, Trip CRUD, Expense CRUD, Settlement, Invite — all live in the root stack above the tabs.

---

## 2. Auth

### 2.1 Sign-In Screen (`/auth`)
**Purpose:** Entry point for all users.

**UI elements:**
- App logo + tagline
- Email input field
- Password input field (with show/hide toggle)
- "Sign in" primary button
- "Forgot password?" link → `/auth/forgot-password`
- "Continue with Google" button
- "Continue with Apple" button (iOS only)
- "Don't have an account? Create one" link → `/auth/signup`

**States:**
- Default (empty form)
- Loading (per-button spinner — email, google, apple each have independent busy state)
- Error (inline error message below form)
- Google sign-in cancelled → silent (no error shown)
- Apple sign-in cancelled → silent (no error shown)

---

### 2.2 Sign-Up Screen (`/auth/signup`)
**Purpose:** Create a new email account.

**UI elements:**
- Display name input
- Email input
- Password input (min 6 characters)
- Confirm password input
- "Create account" button
- "Already have an account? Sign in" link

**States:**
- Validation errors shown inline
- Loading spinner on button
- On success → navigates to `/auth/verify` for OTP

---

### 2.3 Email Verification Screen (`/auth/verify`)
**Purpose:** Confirm email via 6-digit OTP code sent to user's email.

**UI elements:**
- Subtitle showing the email address the code was sent to
- Six individual digit input boxes (tap advances focus)
- "Verify" button
- "Didn't receive it? Go back and try again" hint

**States:**
- Empty digits
- Digits being entered
- Verifying (loading)
- Error (wrong code)

---

### 2.4 Forgot Password Screen (`/auth/forgot-password`)
**Purpose:** Request a password reset code by email.

**UI elements:**
- Email input
- "Send reset code" button

---

### 2.5 Reset Password Screen (`/auth/reset-password`)
**Purpose:** Enter OTP + new password to reset.

**UI elements:**
- 6-digit OTP input boxes
- New password input
- Confirm password input
- "Reset password" button

---

## 3. Home Screen (`/`)

**Purpose:** Overview of all groups and standalone trips; the main entry point after sign-in.

### 3.1 Standard theme layout
- Screen heading ("Home" or localised equivalent)
- **Groups section header** — "Groups"
  - List of GroupCards (see §3.3)
  - Empty state: "No groups yet. Tap + to create one."
- **Trips section header** — "Trips"
  - List of TripCards for standalone trips (not inside a group)
  - Empty state: "No trips yet."
- **Past trips link** — tappable caption at the very bottom → `/trip/archive`
- **FAB** (bottom-right, animated) — tap opens speed-dial:
  - "New group" (with people icon)
  - "New trip" (with plane icon)
- Pull-to-refresh

### 3.2 Ledger theme layout
Replaces the standard list with a summary-first layout:
- **Hero header** — "Overall, you're" + net amount in large font (green = ahead, red = behind) + profile button (top-right)
- **Active trips** section with trip cards showing "Unsettled" red tag
- **Groups** section with group cards
- **FAB** — simpler single button (no speed-dial), tap opens inline pill buttons

### 3.3 GroupCard
Shown in both themes on the Home screen.

**Displays:**
- Group emoji + group name
- Member count + trip count (e.g. "3 members · 2 trips")
- ActivityDot (visual indicator of recent activity)
- BalancePill — shows "You owe €XX", "You're owed €XX", or "All settled" in the appropriate colour

**Action:** Tap → Group Detail screen

### 3.4 TripCard
Shown for standalone trips.

**Displays:**
- Trip name
- Member count
- Net balance for current user (via financial summary)

**Action:** Tap → Trip Detail screen

---

## 4. Groups

### 4.1 Create Group Screen (`/group/create`)
**UI elements:**
- "New Group" heading
- Group name text input (placeholder: "e.g. Weekend Crew")
- Currency picker (default currency for the group)
- "Create" button

**States:**
- Empty / filling in
- Saving (loading)
- Error (inline)

---

### 4.2 Group Detail Screen (`/group/[id]`)
**Purpose:** Central hub for a group — shows balances, all trips within the group, and group-level expenses.

#### Standard theme layout
- **Member avatar row** — up to 5 avatars with initials, "+N" overflow chip if more
- **Per-member balance summary** — each member's net position (you owe / you're owed / settled)
- **Section: Active** — combined list of:
  - TripCards for active/settling trips inside this group
  - GroupExpenseCards for unsettled group expenses
- **"View past items" toggle** — expands to show:
  - Closed trips
  - Settled group expenses
- **Empty state (active):** "No active items yet."
- **"Settle up" button** → Group Settlement screen
- **FAB speed-dial (4 options):**
  - "New trip" — creates a trip pre-filled with the group's members
  - "New expense" — adds a one-off group expense
  - "Recurring expense" — adds a recurring group expense
  - "Add person" — adds a new member to the group
- **Edit (gear icon, top-right)** → Group Edit screen

#### Ledger theme layout
- **Title row:** back chevron + emoji + group name + settings icon
- **Balances card:**
  - "BALANCES" label
  - BalanceViewSelector (toggle between bar chart and list view)
  - LedgerBars component showing each member's position
  - Hairline divider
  - "Settle up" and "Add person" row buttons
- **Active trips** section
- **Group expenses** section
- FAB

---

### 4.3 Edit Group Screen (`/group/edit`)
**UI elements:**
- Group name input
- Currency picker
- Members list — each row shows display name + role badge (Owner / Guest)
- "Add person" button — opens Add Member screen
- Save / Delete group options

---

### 4.4 Add Group Member Screen (`/group/add-member`)
**UI elements:**
- "Add People" heading
- Subtitle with group name
- Member count subtitle
- Display name input (for adding by name)
- "Add" button

---

### 4.5 GroupExpenseCard
Shown in Group Detail's active/past item lists.

**Displays:**
- Expense description
- Total amount
- Payer name
- Settled / unsettled indicator
- Recurring badge (if spawned from a recurring template)

**Action:** Tap → Group Expense Detail screen

---

### 4.6 Group Settlement Screen (`/group/settle/[id]`)
**Purpose:** Calculate and execute the minimum number of payments to clear all debts across a group (spanning multiple trips and group-level expenses).

**UI elements:**
- List of suggested transfers (who owes whom, how much)
- Tap a row → Payment Method Sheet
- "All settled" empty state

---

## 5. Trips

### 5.1 Create Trip Screen (`/trip/create`)
**UI elements:**
- Trip name input
- Currency picker
- If launched from inside a group (`?groupId=` param): shows a member subset picker — all group members listed, all checked by default; user can deselect
- "Create" button

---

### 5.2 Trip Detail Screen (`/trip/[id]`)
**Purpose:** Full expense list and balance view for a single trip.

**Standard theme layout:**
- **TripListHeader** — trip name, member avatar row, status badge (Active / Settling / Closed)
- **Balance bubbles section** — visual summary of who owes whom (min-cash-flow pairs)
- **Spend pie chart** — breakdown by category
- **Expense list** — scrollable list of ExpenseRows (see §5.5)
- **"Empty" state** — plate illustration + "No expenses yet"
- **FAB** (active trips only):
  - "Add expense" → `/expense/add?tripId=`
  - "Invite" → `/invite?tripId=`
- **Closed trip guard:** read-only banner at top when status is `closed`
- **"Settle up" button** (settling/active when expenses exist) → Settlement screen
- **Trip actions** (via header button): Edit trip, View activity, Close trip
- Pull-to-refresh

**Ledger theme layout:**
- Title row: back + emoji + trip name + settings icon
- **Balances card** with BalanceViewSelector (bars or list toggle)
- Member list with per-member net balance
- Expense list below

---

### 5.3 Edit Trip Screen (`/trip/edit`)
- Trip name input
- Currency picker
- Save / Close trip / Delete trip

---

### 5.4 Trip Activity Screen (`/trip/activity`)
**Purpose:** Chronological audit feed of all events on a trip.

**UI elements:**
- Timeline list of ActivityDot entries
- Each row: event type, who, amount, timestamp

---

### 5.5 ExpenseRow
Shown in Trip Detail's expense list.

**Displays:**
- Description
- Amount (in trip currency; original currency shown if multi-currency)
- Payer avatar + name
- Category icon
- Receipt indicator (if receipt image attached)
- Recurring badge (if auto-spawned)

**Action:** Tap → Expense Detail screen

---

### 5.6 Closed Trips / Archive Screen (`/trip/archive`)
**Purpose:** Read-only list of all closed trips.

**UI elements:**
- List of ClosedTripCards
- Empty state

---

## 6. Expenses

### 6.1 Add / Edit Expense Screen (`/expense/add`, `/expense/edit`, `/group/expense/add`)
**Purpose:** Create or modify an expense for a trip or group.

**UI elements:**
- **Description** text input
- **Amount** numeric input (large, prominent)
- **Currency picker** — can differ from trip currency; exchange rate fetched live (shows "live", "cached", or "approximate" source)
- **Payer selector** — chip/avatar row; tap to change who paid
- **Category selector** — icon grid (food, transport, accommodation, activities, etc.)
- **Split section:**
  - Toggle between Equal and Custom split modes
  - Per-member rows with amount shown
  - In Custom mode: each row has an editable amount input
  - ProportionalSplitBar — visual bar showing each person's share
- **Notes input** (optional)
- **Receipt capture button** — opens camera or photo library
  - On capture: image preview shown inline; OCR auto-fills description + amount if detected
- **"Save" / "Add Expense" button**

**States:**
- Blank (new expense)
- Populated (edit mode — prefills all fields)
- Saving (loading)
- Error (inline banner)
- Receipt uploading (spinner on receipt preview)

---

### 6.2 Expense Detail Screen (`/expense/[id]`, `/group/expense/[id]`)
**Purpose:** View a single expense and its splits.

**Displays:**
- Description, total amount, date
- Category icon
- Payer name + avatar
- Receipt image (tappable to view full-size)
- Original currency + exchange rate (if multi-currency)
- Splits list: each member + their share + settled/owed status
- Recurring source badge (if spawned from a recurring template)
- "Make recurring" button (group expenses only, both settled and unsettled)

**Actions:**
- Edit (pencil icon, header)
- Delete

---

## 7. Recurring Expenses (Groups only)

### 7.1 MakeRecurringSheet (bottom sheet on Group Expense Detail)
**Triggered by:** "Make recurring" button on any group expense (settled or not).

**UI elements:**
- **Period picker** — four options displayed as selectable chips:
  - Weekly
  - Every 2 weeks
  - Monthly
  - Quarterly
- **Start date row** — "−" / date display / "+" day controls
- **"Set up recurring" confirm button**

**Behaviour:** On confirm, the existing expense is used as the first occurrence (not duplicated). A server-side template is created; pg_cron spawns new expenses at 06:00 UTC on each due date.

---

### 7.2 Add Recurring Expense Screen (`/group/expense/add?recurring=true`)
Same form as the standard group expense form (§6.1) but with the MakeRecurringSheet shown immediately on save.

---

### 7.3 Recurring Expense in Group Detail
Recurring expenses spawned by the template appear in the Active items list with a recurring badge. The template itself is managed from the Group Expense Detail screen.

**Manage actions:** Edit template, Pause (suspends future spawns), Resume, Delete template.

---

## 8. Settlement & Payments

### 8.1 Settlement Screen (`/settle/[tripId]`)
**Purpose:** Show the minimal set of payments needed to clear all debts in a trip.

**UI elements:**
- **Your balance summary row** — "You owe €XX" or "You are owed €XX" or "All settled up" (coloured accordingly)
- **Settlement rows** — each row: payer avatar → amount → recipient avatar + "Pay" button
- **Empty state:** "Everyone is settled up." with "Close Trip" and "Roll Over Debts" actions
- **When everything is settled:** bottom bar "All settled — Close Trip"
- **"Roll Over Debts" button** → Rollover screen (when debts remain but trip is being closed)
- **"Close Trip" button**

**Tap a settlement row →** Payment Method Sheet

---

### 8.2 Payment Method Sheet (bottom sheet)
**Triggered by:** Tapping a settlement row.

**UI elements:**
- Sheet title: "Pay via…"
- Subtitle: "Choose how to send payment to [name]."
- Draggable handle (swipe down to dismiss)
- Available method list — each row: icon + label + description + chevron
- "Cancel" link at bottom

**Available payment methods (dynamically shown based on what's installed/available):**
| Method | Description |
|--------|-------------|
| Stripe | "Send a secure payment link or QR" |
| Tink Open Banking | "SEPA Bank Transfer" |
| Revolut | "Open in Revolut app" |
| PayPal | "Send via PayPal.me" |
| Venmo | "Open in Venmo app" |
| Wero | "Open in Wero / banking app" |
| Lydia | "Open in Lydia app" |
| Other | "Use a generic payment link" |

**States:**
- Loading (spinner while checking available methods)
- Methods shown
- Launching (disabled state while payment opens)
- Invalid amount error (if amount is zero or malformed)

---

### 8.3 Stripe Payment Flow
On selecting Stripe:
- A Stripe Checkout Session / Payment Link is created server-side
- A QR code or shareable link is shown to the recipient
- Status polling begins — SplitRequest status tracks: `created` → `pending` → `completed` / `declined` / `expired`
- StripePaymentCard component displayed on the settlement row while polling

---

### 8.4 Open Banking (SEPA) Screen (`/settle/bank-transfer`)
**Purpose:** Initiate a bank transfer via Tink.

**UI elements:**
- Heading: "SEPA Bank Transfer"
- Subtitle: "Sending €XX to [name]"
- **Bank selector** — optional; searchable dropdown of supported banks
- **IBAN input** — the creditor's IBAN (recipient's account)
- IBAN validation feedback (format check, country support)
- "Continue to bank" button → opens Tink authorisation URL in browser
- On return: app polls status; shows `authorized` / `completed` / `declined`

---

### 8.5 Deep-Link Wallet Flow (Revolut, PayPal, Venmo, Wero, Lydia)
- App builds a deep link for the chosen wallet
- Confirmation dialog: "Did you send €XX via [wallet]? Yes, I paid"
- On confirm: SplitRequest status updated to `paid`
- No payment data is sent to or stored by ouiShare

---

### 8.6 Rollover Screen (`/settle/rollover/[tripId]`)
**Purpose:** Carry unpaid debts forward into a new trip rather than forgetting them.

**UI elements:**
- List of unsettled debts showing who owes whom
- "Roll over" button — creates the new trip with seed debts pre-loaded
- "Cancel" to go back

---

### 8.7 Audit / Payment History Screen (`/settle/audit/[tripId]`)
**Purpose:** Full chronological log of every payment request on a trip.

**UI elements:**
- Count: "N records"
- Each row:
  - Payer → recipient
  - Amount + currency
  - Payment method label (Stripe, SEPA Bank Transfer, Revolut, Venmo, Lydia, PayPal, Other)
  - SplitStatusBadge (owed / paid / created / request_sent / authorized / pending / completed / declined / expired)
  - Reference ID (Stripe session ID, OB payment ID, or external ref)
- Empty state: "No payment history yet."

---

### 8.8 SplitStatusBadge
Used on settlement rows and in the audit log.

**States and labels:**
| Status | Display |
|--------|---------|
| `owed` | "Owed" (neutral) |
| `paid` | "Paid" (green) |
| `created` | "Created" (muted) |
| `request_sent` | "Sent" (muted) |
| `authorized` | "Authorised" (amber) |
| `pending` | "Pending" (amber) |
| `completed` | "Completed" (green) |
| `declined` | "Declined" (red) |
| `expired` | "Expired" (red) |

---

## 9. Balance Tab (`/balance`)

**Purpose:** See your net financial position across all active (non-closed) trips at a glance.

**Header strip:**
- Theme switcher: "Default" / "Ledger" pill buttons

**List:**
- One row per active trip
- Each row: trip name + status badge + net balance (colour coded)
  - Green: "You are owed €XX"
  - Red: "You owe €XX"
  - Neutral: "Settled"
- Tap a row → Trip Detail screen
- Empty state: "No active trips"

---

## 10. Invite & Join

### 10.1 Invite Screen (`/invite`)
**Purpose:** Share a join link for a trip.

**UI elements:**
- InviteLinkCard — displays the shareable link
- "Share" system share sheet trigger (native OS share)
- QR code option

---

### 10.2 Add Participant Screen (`/add-participant`)
**Purpose:** Add a named placeholder participant to a trip without requiring them to have an account.

**UI elements:**
- Name input
- "Add" button

---

### 10.3 Join Screen (`/join/[token]`)
**Purpose:** Landing screen when a user follows an invite link.

**States:**
- Loading (resolving token)
- Prompt to sign in / create account (if not already signed in)
- "Joining…" after auth
- Success → navigates to Trip Detail
- Error (invalid/expired token)

**Behaviour on join:**
- If the user's email matches a placeholder member in the trip, they are automatically linked to that placeholder (guest session claim)
- If no email match, they are added as a new member

---

## 11. Notifications

### 11.1 Push Notification Permission
- Requested once on first launch (after sign-in)
- Push token stored server-side; used for in-app event notifications only

### 11.2 Notification Event Types
| Event | Trigger |
|-------|---------|
| `expense_added` | Someone adds an expense to a trip/group you're in |
| `expense_settled` | A group expense is settled |
| `group_invite` | You are invited to a group |
| `debt_owed` | A settlement is requested from you |
| `payment_request` | Someone requests payment |

### 11.3 Channels defined in the model
`push`, `email`, `sms`, `whatsapp` — push channel is the only one currently active in the app.

---

## 12. Theme System

Two themes are available, switchable from the Balance tab header.

### 12.1 Default theme
- Light and dark mode support
- Design tokens: `colors.background`, `colors.surface`, `colors.primary`, `colors.error`, `colors.success`, `colors.border`, `colors.text.primary/secondary/tertiary`
- Standard card radius, spacing, and shadow system

### 12.2 Ledger theme
A distinct visual style intended for a finance-first feel.
- **Palette:** dark navy (`#0B1733`) background, `#F5A623` gold accent, muted white text
- **Typography:** display font (tabular numerals for amounts), slightly larger headings
- **Home screen:** replaces standard section list with a hero net-balance header + scrollable card layout
- **Group Detail:** replaces member list with a LedgerBars component (horizontal bar chart of per-member balances)
- **BalanceViewSelector:** toggle on Group Detail between bar chart view and list view
- **Cards:** tighter corners, card shadow (`ledgerShadow.card`)
- **FABs:** simpler (no speed-dial animation on home), same gold/primary colour

---

## 13. Key Shared UI Components

| Component | Purpose |
|-----------|---------|
| BalancePill | Compact coloured badge: "You owe", "You're owed", "Settled" |
| ActivityDot | Small dot indicator for recent activity on a card |
| LedgerBars | Horizontal bar chart of member balances (Ledger theme) |
| BalanceViewSelector | Segmented control to switch between bars/list balance views |
| SplitStatusBadge | Coloured status pill for payment states |
| PaymentProofCard | Displays a Stripe payment link/QR while polling |
| StripePaymentCard | Inline card shown on a settlement row during Stripe polling |
| Avatar | Circular avatar with initials fallback and optional image |
| ScreenWrapper | Standard safe-area + scroll container |
| ErrorBanner | Inline error strip |
| ClosedTripGuard | Read-only overlay/banner for closed trips |
| TripListSkeleton / SettlementSkeleton / TripDetailSkeleton | Placeholder loading states |
| ProportionalSplitBar | Visual bar showing each person's expense share |
| MakeRecurringSheet | Bottom sheet for setting up recurring expense schedule |
| PaymentMethodSheet | Bottom sheet for choosing a payment method |
| UniversalTabBar | Custom tab bar (hidden on auth + join screens) |

---

## 14. Key Screen States

Every data screen should handle these states:

| State | Behaviour |
|-------|-----------|
| **Loading** | Skeleton component or spinner; no content flash |
| **Empty** | Illustration or icon + descriptive caption + call-to-action |
| **Error** | ErrorBanner with retry option |
| **Offline** | OfflineBanner (fixed strip at top) |
| **Populated** | Normal content |

---

## 15. User Flows Summary

### New user
Sign-In → Create account → OTP verify → Home (empty) → Create group or trip → Add expense

### Joining a trip
Follow invite link → Sign in / Create account → Auto-join → Trip Detail

### Settling a trip expense
Trip Detail → "Settle up" → Settlement screen → Tap settlement row → Payment Method Sheet → Choose method → Complete payment → Status updated

### Creating a recurring group expense
Group Detail FAB → "Recurring expense" → Expense form → Save → MakeRecurringSheet → Choose period + start date → Confirm

### Promoting an existing expense to recurring
Group Expense Detail → "Make recurring" → MakeRecurringSheet → Confirm

### Rolling over debts
Settlement screen (all paid or partial) → "Roll Over Debts" → Rollover screen → Confirm → New trip created with seed debts

### Archiving a trip
Trip Detail → Edit → "Close Trip" → Trip moves to Closed state → Appears in Archive tab
