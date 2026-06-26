# ouiShare — App Store Release Checklist

**Launch target:** Android, France / EU first. Expand to all Android markets, then iOS.
Check off each item as it is completed.

---

## 1 — Authentication & Onboarding  ✅ ENGINEERING COMPLETE

### Design decisions — confirmed ✅
- **Entry point:** Welcome screen with branding, then Google / Apple / Continue as Guest.
- **Invite matching:** When a user arrives via invite link and authenticates, match their email to any pre-added placeholder TripMember on the trip and merge (update `userId` on the placeholder row). Avoids duplicate participants.
- **Guest recovery:** When a guest signs in with Google/Apple, re-parent their TripMember records to the new account ID so their trips follow them. v1.

### Engineering — done ✅
- [x] `app/auth/index.tsx` — Welcome screen with Google, Apple (iOS only), and guest buttons
- [x] `app/auth/guest.tsx` — Name entry form → `IAuthService.signInAsGuest(name)`
- [x] Google Sign-In: `signInWithGoogle()` in `SupabaseAuthService` using `GoogleSignin.signIn()` → `supabase.auth.signInWithIdToken()`; plugin added to `app.config.ts`
- [x] Apple Sign-In: `signInWithApple()` using `expo-apple-authentication`; iOS-only guard; plugin added to `app.config.ts`
- [x] Root layout auth gate (`AuthGate` in `app/_layout.tsx`) — redirects unauthenticated users to `/auth`; `join/*` whitelisted as public
- [x] `IAuthService` — added `signInWithGoogle`, `signInWithApple`, `recoverGuestSession`
- [x] `MockAuthService` stubs for all new methods; `InMemoryMemberRepository` implements `findMemberByEmail` + `claimMemberSlot`
- [x] `SupabaseMemberRepository` — `findMemberByEmail` (`.ilike()`), `claimMemberSlot` (calls `claim_member_slot` RPC)
- [x] `supabase/migrations/015_auth_rpcs.sql` — `claim_guest_session` + `claim_member_slot` security-definer RPCs
- [x] `useJoinTrip` — email→placeholder matching before `addMember`; 5 new tests; 752/752 total passing
- [x] `UniversalTabBar` hidden on `/auth*` and `/join*`
- [ ] Guest upgrade prompt — deferred to v1.1

### Supabase configuration required (do before first real build)
- [x] In Supabase Dashboard → Authentication → Providers: enable **Google** (paste Web Client ID + Secret)
- [ ] In Supabase Dashboard → Authentication → Providers: enable **Apple** (paste Service ID + Key) — defer to iOS phase
- [x] In Supabase Dashboard → Authentication → URL Configuration: add `ouishare://auth/callback` to Redirect URLs
- [x] Run migration `015_auth_rpcs.sql` against production database
- [x] Authentication → Settings → **Enable email confirmations** = ON (required for OTP flow — if off, signUp skips OTP)
- [x] Authentication → Settings → **Minimum password length** = 6 (matches client-side validation)
- [x] Authentication → Email Templates → Confirm signup: body uses `{{ .Token }}` not the default magic link URL
- [ ] **Custom SMTP configured via Resend** — see Section 8. Free-tier Supabase SMTP is limited to 2 emails/hour; must be done before any real users sign up with email.

### Native configuration required (do before first real build)
- [x] Get real `GOOGLE_WEB_CLIENT_ID` from Google Cloud Console (OAuth 2.0 → Web client) and set as EAS secret
- [x] Register app SHA-1 fingerprint in Google Cloud Console for Android
- [ ] Enable "Sign in with Apple" capability in Xcode for iOS — defer to iOS phase

---

## 2 — Stripe Setup  🟡 TEST MODE COMPLETE — live keys remaining

### Step 1 — Create Stripe account
1. Go to https://stripe.com and click "Start now"
2. Enter business email, name, country (**France**), and set a password
3. Verify your email address
4. In the dashboard, complete the business profile:
   - Business type: Individual or Company
   - Business category: **Software / SaaS**
   - Business website: your support/marketing URL (can be a placeholder initially)
   - Bank account: add a French IBAN to receive payouts

### Step 2 — Get API keys (test mode first)
1. Dashboard → Developers → API keys
2. Copy **Publishable key** (`pk_test_…`) → this goes in `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. Copy **Secret key** (`sk_test_…`) → this goes in the Supabase Edge Function secret `STRIPE_SECRET_KEY`
4. **Do not commit either key to git**

### Step 3 — Configure Supabase Edge Function secrets
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_YOUR_KEY
```
(Run from your local Supabase CLI against the linked production project.)

### Step 4 — Register the webhook
1. Dashboard → Developers → Webhooks → "Add endpoint"
2. Endpoint URL: `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
4. Click "Add endpoint" — Stripe shows a **Signing secret** (`whsec_…`)
5. Save it: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET`

### Step 5 — Test end-to-end in test mode
```bash
# Install Stripe CLI (once): https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
# In another terminal, trigger a test event:
stripe trigger checkout.session.completed
```
Confirm the split_request row in Supabase updates to `completed`.

### Step 6 — Switch to live mode before launch
1. Dashboard → toggle "Test mode" off (top-left)
2. Repeat Step 2 for **live** keys (`pk_live_…`, `sk_live_…`)
3. Update EAS secret and Supabase secret with live keys
4. Register a new live webhook endpoint (same URL, same events)
5. Update `STRIPE_WEBHOOK_SECRET` with the live signing secret

- [x] Stripe account created and business profile completed
- [x] Test keys added as EAS secret (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`) and Supabase secret (`STRIPE_SECRET_KEY`)
- [x] Webhook registered in test mode, signing secret saved
- [x] End-to-end test payment confirmed in test mode (200 response, signature verified, graceful skip on no split_request_id — expected)
- [ ] Live keys and live webhook configured before launch

---

## 3 — Market Rollout Strategy  🟡 IN PROGRESS

### Phase 1 — Android, France / EU
- [x] Google Play Console account created (one-time $25 fee)
- [x] App record created, package name `com.ouishare.app`
- [ ] **Country / region** set to France initially (expand later without a new build)
- [ ] Content rating questionnaire completed (IARC — takes ~5 min)
- [ ] Data safety form completed (declare: camera, contacts, payment info)
- [ ] GDPR compliance: privacy policy must reference EU data rights (right of access, erasure, portability)
- [ ] Tink (Open Banking) is EU-native — confirm it is enabled for France at launch

### Phase 2 — Expand Android to all markets
- [ ] In Google Play Console → App availability → expand to all countries
- [ ] Review pricing (free vs. in-app purchase) per region — no code change needed if pricing is uniform
- [ ] Translate store listing metadata to additional languages (optional but improves conversion)

### Phase 3 — iOS, all markets
- [ ] Apple Developer Program enrolled ($99/yr): https://developer.apple.com/programs/
- [ ] App Store Connect app record created, bundle ID `com.ouishare.app`
- [ ] "Sign in with Apple" is **required** on iOS if any other social login is offered — must be implemented before this phase
- [ ] Run `eas build --platform ios --profile production`
- [ ] Submit to TestFlight first for smoke testing
- [ ] Submit for App Store review (typically 1–3 days)

---

## 4 — App Store Metadata  🟡 COPY DONE — ASSETS REMAINING

### Copy — done ✅
All written copy is in `store-assets/play-store-metadata.md`:
- [x] App name: `ouiShare`
- [x] Short description written in English (72 chars) and French (78 chars)
- [x] Full description written in English and French
- [x] Keywords / search terms listed for both languages
- [x] Screenshot list defined (6 screens, instructions included)
- [x] Feature graphic brief included (1024×500, dark theme, layout described)

### Assets — your side
- [ ] App name confirmed available in Google Play Console (check when account is active)
- [ ] 6 screenshots captured from `npm run simulate` on Android emulator and annotated in Canva
- [ ] Feature graphic created (1024×500) — brief in `store-assets/play-store-metadata.md`
- [ ] App icon confirmed (1024×1024, no transparency) — check `assets/icon.png`
- [ ] Support URL live (GitHub Pages or Notion — minimum: app name, contact email, privacy policy link)

### Entering copy into Play Console
1. Play Console → your app → **Store listing**
2. Default language: set to French, paste FR copy
3. Add translation: add English, paste EN copy
4. Screenshots: upload to the Phone section (1080×1920)
5. Feature graphic: upload to the Store listing graphics section

---

## 5 — Privacy Policy  🟡 HOSTED — PLAY CONSOLE SUBMISSION REMAINING

### Draft — done ✅
- [x] English draft: `store-assets/privacy-policy-en.md`
- [x] French draft: `store-assets/privacy-policy-fr.md`
- [x] HTML versions hosted on GitHub Pages: `https://tyrtel.github.io/ouishare-legal/`
- [x] Placeholders filled in (McCleery Enterprises, tyrtel@gmail.com)
- [x] Covers: account data, trip data, camera, contacts, Stripe, Tink, Supabase
- [x] Includes: legal basis, retention periods, GDPR rights, CNIL authority, children clause

### Remaining checklist
- [x] Add URL to `app.config.ts → extra.privacyPolicyUrl`
- [ ] Submit URL in Google Play Console → App content → Privacy policy
- [ ] In-app link to policy added to auth / settings screen (future task)
- [ ] Submit URL in App Store Connect when iOS phase begins

---

## 6 — App Compliance (EU / Android)  🟡 PARTIALLY COMPLETE

- [x] Camera usage string added to `app.config.ts → ios.infoPlist` (`NSCameraUsageDescription`)
- [x] Photo library usage string added (`NSPhotoLibraryUsageDescription`)
- [x] Contacts usage string added (`NSContactsUsageDescription`)
- [x] `expo-image-picker` plugin added to `app.config.ts` with camera + photo permissions
- [x] Android `permissions` declared: `CAMERA`, `READ_CONTACTS`
- [x] Deep-link scheme confirmed: `scheme: "ouishare"` at top level (expo-router handles Android intent filters automatically)
- [ ] Google Play Data Safety form completed (declare camera, contacts, no ad tracking) — done in Play Console during Section 3
- [ ] Age rating: 4+ / Everyone — done in Play Console during Section 3

---

## 7 — EAS Build & Production Deploy  🟡 BUILD COMPLETE — UPLOAD REMAINING

- [x] EAS CLI installed (v20.0.0)
- [x] eas.json validated and fixed; appVersionSource set to remote
- [x] EAS project created: @tyrtel/ouishare (projectId: a1b9adb5-735f-46c6-9457-e4161f0eee99)
- [x] EAS env vars set: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
- [x] Android keystore generated and stored by EAS
- [x] Placeholder assets added (assets/icon.png, adaptive-icon.png, splash.png, favicon.png)
- [x] metro.config.js added — all expo doctor checks pass
- [x] First Android production build completed successfully
- [x] Download the `.aab` from EAS dashboard and upload to Google Play Console → Internal testing track
- [x] Register app SHA-1 fingerprint in Google Cloud Console (get from EAS keystore after upload)
- [ ] Run iOS build when ready for Phase 3: `eas build --platform ios --profile production`

---

## 8 — External Service Wiring  🟡 NEARLY COMPLETE

- [x] Stripe webhook registered (see Section 2 above for step-by-step)
- [x] Supabase migrations deployed to production: all 15 migrations applied
- [x] Supabase Edge Functions deployed: all 7 functions live (create-payment-link, ob-initiate, ob-status, ob-webhook, parse-receipt, payment-status, stripe-webhook)
- [x] Verify Supabase project is in **EU region** (Frankfurt or West EU) — required for GDPR (confirmed eu-west-1 Ireland)
- [ ] **Resend SMTP configured** (see steps below)

### SMTP — Resend setup (required for email OTP sign-up)

Supabase's built-in shared SMTP caps at **2 emails per hour**. Resend has a free tier of
3,000 emails/month (100/day) and takes about 10 minutes to set up.

#### Step 1 — Create a Resend account
1. Go to [https://resend.com](https://resend.com) and sign up (free, no credit card)
2. Verify your Resend account email

#### Step 2 — Add and verify your sending domain
1. Resend dashboard → **Domains** → "Add domain"
2. Enter the domain you want to send from (e.g. `ouishare.app` or your support subdomain)
3. Resend shows you 3 DNS records to add:
   - **SPF** — TXT record on `@` or your subdomain
   - **DKIM** — TXT record (long key) on `resend._domainkey`
   - **DMARC** — TXT record on `_dmarc` (optional but recommended)
4. Add these records in your DNS provider (Namecheap, Cloudflare, Google Domains, etc.)
5. Back in Resend → **Domains** → click "Verify DNS records" — all three should turn green
   - DNS propagation can take a few minutes to a few hours; check again if not green immediately

#### Step 3 — Create an API key
1. Resend dashboard → **API Keys** → "Create API key"
2. Name it `ouiShare Supabase SMTP`
3. Permission: **Sending access** is sufficient
4. Copy the key — it starts with `re_` and is only shown once

#### Step 4 — Configure Supabase SMTP
1. Supabase Dashboard → **Authentication → Settings** → scroll to **SMTP Settings**
2. Toggle **Enable Custom SMTP** = ON
3. Fill in:
   | Field | Value |
   |---|---|
   | Sender name | `ouiShare` |
   | Sender email | `noreply@yourdomain.com` (must be on your verified Resend domain) |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your `re_…` API key from Step 3 |
4. Click **Save**

#### Step 5 — Test it
1. In Supabase Dashboard → **Authentication → Users** → "Invite user" (sends a test email)
2. Confirm the email arrives from `noreply@yourdomain.com` and is not in spam
3. Alternatively, run through the full sign-up OTP flow in your app on a real device

#### Notes
- Resend free tier: 3,000 emails/month, 100/day — more than enough for early launch
- If you exceed the free tier, upgrade to the $20/month plan (50,000 emails/month)
- Do **not** commit the `re_…` API key to git; it only lives in Supabase's dashboard settings

---

## 9 — Physical Device Testing  🔴 BLOCKING

- [ ] Install from Google Play Internal Testing track on a physical Android device
- [ ] Stripe payment round-trip: open checkout, pay with test card `4242 4242 4242 4242`, confirm status updates in app
- [ ] Open Banking return URL: `ouishare://ob-return` is handled correctly after bank redirect
- [ ] Camera / OCR: receipt capture and parse on real device hardware
- [ ] Offline banner appears when airplane mode is enabled
- [ ] Google Sign-In completes successfully on device (not just simulator)

---

## 10 — Pre-Launch Data Cleanup  🔴 BLOCKING

- [ ] **Purge test and Firebase Test Lab accounts from Supabase before going live.** Google's automated Pre-Launch Report creates Google-provider accounts each time a build is submitted to Play Console. By launch there will be a backlog of junk accounts that should be removed so production user counts are clean.

  Run the following in the Supabase SQL Editor. It deletes every account that is not yours, so confirm your own user ID first (Auth → Users → find your Google account → copy the UUID) and substitute it below.

  The safe delete query (plain text, run as a transaction):

      BEGIN;

      CREATE TEMP TABLE accounts_to_delete AS
      SELECT id FROM auth.users
      WHERE id <> '<YOUR_USER_UUID_HERE>';

      SELECT COUNT(*) AS accounts_to_delete FROM accounts_to_delete;

      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM trips    WHERE owner_id        IN (SELECT id FROM accounts_to_delete)) THEN
          RAISE EXCEPTION 'Some accounts own trips — review before deleting';
        END IF;
        IF EXISTS (SELECT 1 FROM expenses WHERE paid_by_user_id IN (SELECT id FROM accounts_to_delete)) THEN
          RAISE EXCEPTION 'Some accounts paid for expenses — review before deleting';
        END IF;
        IF EXISTS (SELECT 1 FROM splits   WHERE user_id         IN (SELECT id FROM accounts_to_delete)) THEN
          RAISE EXCEPTION 'Some accounts have splits — review before deleting';
        END IF;
      END $$;

      DELETE FROM auth.users WHERE id IN (SELECT id FROM accounts_to_delete);

      SELECT COUNT(*) AS remaining_users FROM auth.users;

      COMMIT;

  After committing, remaining_users should be 1 (your account). If the safety checks raise an exception, roll back and inspect that account before proceeding.

---

## 11 — Pre-Launch Bug Fixes  🟡 PARTIALLY COMPLETE

- [x] **Duplicate "Total" label on expense list screen** — removed the redundant `Total:` footer from `SpendPieChart`; `TripActivityScreen` already shows the total in the card above
- [x] **Split itemized expense feature** — verified working: `computeItemizedSplits` correctly distributes line item costs, `splitIsValid` gates correctly, save path wired through `metadata.lineItems`

---

## 11 — Nice-to-Have (v1.1)

- [ ] Guest → account upgrade prompt after first trip created
- [ ] Swipe-to-mark-paid gesture in `SettlementRow`
- [ ] Tink `BankSelectorSheet` — requires Tink sandbox credentials
- [ ] Push notifications for settlement status changes
- [ ] Android / iOS tablet layout optimisation
- [ ] **Localisation — Engineering**
  - [ ] Install `expo-localization`, `i18next`, `react-i18next`
  - [ ] Create `src/i18n/` with `en.json` and `fr.json` (key/value pairs)
  - [ ] Wire up `i18next` init in `app/_layout.tsx`, reading locale from `expo-localization`
  - [ ] Replace hardcoded display strings across components with `t('key')` hook calls
  - [ ] Add `ILocalisationService` + mock to DI container if locale-switching is needed at runtime
- [ ] **Localisation — Translations**
  - [ ] Audit all user-facing strings and list them as keys in `en.json`
  - [ ] Produce French translations for all keys in `fr.json`
  - [ ] Verify French copy with a native speaker or translation service
