# Authentication — Apple Sign-In Implementation & Provider Expansion Audit

---

## Part 1: Apple Sign-In — What Was Added

Apple Sign-In is fully implemented and ships in the current build. This section documents every change that was made to the codebase to add it, so the pattern is clear when adding future providers.

### 1. Package dependency

```
npx expo install expo-apple-authentication
```

`expo-apple-authentication` is an Expo-managed module that wraps `ASAuthorizationAppleIDProvider` on iOS. No manual native linking is required. Expo's build system wires up the entitlement automatically when the plugin is present in `app.config.ts`.

`package.json` dependency added:
```
"expo-apple-authentication": "~55.0.13"
```

---

### 2. Expo app config

**`app.config.ts`**

Added the plugin entry inside the `plugins` array:

```typescript
['expo-apple-authentication'],
```

This is the only config change needed. Unlike Google, Apple Sign-In has no environment variables — the identity token comes from the OS and is verified server-side by Supabase against Apple's public keys.

---

### 3. Auth service interface

**`src/core/interfaces/IAuthService.ts`**

One method added to the interface:

```typescript
signInWithApple(): Promise<Result<User, AppError>>;
```

This follows the same `Result<T, E>` pattern as `signInWithGoogle`. The caller never handles a success/failure branch differently depending on the provider.

---

### 4. Mock implementation

**`src/__mocks__/MockAuthService.ts`**

```typescript
async signInWithApple(): Promise<Result<User, AppError>> {
  // Resolves with a fixed test user so tests can exercise the happy path
  // without any native module involvement.
  const user = this._makeUser('apple-test-user@privaterelay.appleid.com', 'Apple User');
  this._currentUser = user;
  return ok(user);
}
```

The mock satisfies the interface and is used by both Jest (`createTestContainer`) and simulation mode (`createSimulationContainer`).

---

### 5. Production implementation

**`src/infrastructure/supabase/SupabaseAuthService.ts`**

```typescript
async signInWithApple(): Promise<Result<User, AppError>> {
  // Apple Sign-In is iOS-only at the OS level.
  if (Platform.OS !== 'ios') {
    return err({ kind: 'AuthError', message: 'Apple Sign-In is only available on iOS.' });
  }

  const available = await AppleAuth.isAvailableAsync();
  if (!available) {
    return err({ kind: 'AuthError', message: 'Apple Sign-In is not available on this device.' });
  }

  const credential = await AppleAuth.signInAsync({
    requestedScopes: [
      AppleAuth.AppleAuthenticationScope.FULL_NAME,
      AppleAuth.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    return err({ kind: 'AuthError', message: 'Apple did not return an identity token.' });
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error || !data.user) {
    return err({ kind: 'AuthError', message: error?.message ?? 'Apple sign-in failed.' });
  }

  // Apple only provides the user's full name on the very first sign-in.
  // On subsequent sign-ins, credential.fullName is null. Fall back to the
  // email prefix or a generic placeholder so display_name is never blank.
  const givenName  = credential.fullName?.givenName;
  const familyName = credential.fullName?.familyName;
  const displayName = (givenName || familyName)
    ? [givenName, familyName].filter(Boolean).join(' ')
    : (data.user.email?.split('@')[0] ?? 'User');

  const user = await this._upsertUser(data.user, displayName, undefined);
  return ok(user);
}
```

Key behaviour notes:
- Platform-gated before any SDK call to avoid a runtime crash on Android.
- Availability-checked because Apple Sign-In is unavailable on simulators without an Apple ID configured.
- The name-only-on-first-signin limitation is a platform constraint enforced by Apple; the fallback chain here is the correct handling.
- `_upsertUser()` is a private helper that `INSERT … ON CONFLICT DO UPDATE` into the `public.users` table, shared by both Google and Apple.

---

### 6. UI integration

**`app/auth/index.tsx`**

```tsx
{Platform.OS === 'ios' && (
  <AppleAuthentication.AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
    cornerRadius={12}
    style={styles.appleButton}
    onPress={handleAppleSignIn}
  />
)}
```

The button is rendered only on iOS — it is never shown on Android. `handleAppleSignIn` calls `authService.signInWithApple()` via the DI container and routes the result through the same success/error handling as the other providers.

---

### 7. No database migration required

Supabase's `auth.users` table natively stores Apple identity provider records alongside email and Google records. The `public.users` table that the app controls was already in place. No migration was needed.

---

### 8. No Supabase dashboard changes required (for development)

Apple Sign-In works in development without enabling anything in the Supabase Auth dashboard. For production, Apple must be enabled in the Supabase dashboard under Authentication → Providers and the Apple Services ID and Team ID must be configured there. This is an ops step, not a code step.

---

### Summary of touched files

| File | Change |
|------|--------|
| `package.json` | Added `expo-apple-authentication` |
| `app.config.ts` | Added `expo-apple-authentication` plugin entry |
| `src/core/interfaces/IAuthService.ts` | Added `signInWithApple()` to interface |
| `src/__mocks__/MockAuthService.ts` | Added mock implementation |
| `src/infrastructure/supabase/SupabaseAuthService.ts` | Added production implementation |
| `app/auth/index.tsx` | Added iOS-conditional button |

No new DI token was needed. No new migration was needed. The pattern is: dependency → config → interface → mock → production → UI, and it added roughly 60 lines of production code.

---

---

## Part 2: Auth Provider Expansion Audit

What follows is an assessment of every auth method commonly expected in a consumer mobile app in this category (bill-splitting, friend groups, European/international market), rated by implementation effort in the context of this specific codebase.

Difficulty scale:
- **Low** — a few hours; Supabase has native support; no new native modules
- **Medium** — 1–3 days; some native SDK work or non-trivial UI
- **High** — multiple days; external vendor setup, review processes, or architectural changes

---

### Phone number / SMS OTP

**What it is:** User enters a mobile number, receives a 6-digit SMS code, enters it to authenticate. No password ever set.

**Why it matters for this app:** Dominant auth pattern in France, Germany, and most of continental Europe for consumer apps. Users without a Google account or Apple device (Android users especially) often prefer phone sign-in over creating an email/password. In markets where WhatsApp is primary communication, phone number feels natural as identity.

**Implementation difficulty: Medium**

Supabase supports phone auth natively via Twilio or MessageBird. The auth flow is:

```
supabase.auth.signInWithOtp({ phone: '+33612345678' })
// user receives SMS
supabase.auth.verifyOtp({ phone: '+33612345678', token: '123456', type: 'sms' })
```

What would need to change in this codebase:

1. `IAuthService` — add `signInWithPhone(phone)` and `verifyPhoneOtp(phone, token)` methods
2. `SupabaseAuthService` — implement both; phone formatting (E.164) must be enforced before the Supabase call
3. `MockAuthService` — stub both methods
4. UI — new screen for phone number entry (with a country-code picker) and reuse or extend the existing OTP verification screen at `app/auth/verify.tsx`
5. Supabase dashboard — enable Phone provider, connect a Twilio account
6. No new native modules needed

The main non-trivial work is the country-code picker (users enter `06 12 34 56 78` not `+33612345678`) and the ongoing cost of SMS sends. Twilio charges roughly €0.05–€0.08 per SMS in Europe. At scale this becomes material.

**Estimated code changes:** ~150 lines of production code, new auth screen, new UI component for phone input.

---

### Anonymous / guest sign-in

**What it is:** User taps "Continue without an account" and gets a temporary anonymous session. They can use the app immediately. If they later sign up or sign in, the guest data is merged into their real account.

**Why it matters for this app:** Reduces friction on first launch significantly. Particularly important for invite flows — a user who receives a group invite link and has never heard of the app should be able to join the group immediately, try the experience, then convert.

**Implementation difficulty: Low**

The database side of this is already partially built. `supabase/migrations/015_auth_rpcs.sql` contains a `claim_guest_session()` RPC for migrating guest data to a real account. Supabase added native anonymous sign-in support in 2023:

```
supabase.auth.signInAnonymously()
```

What would need to change:

1. `IAuthService` — add `signInAnonymously()` method
2. `SupabaseAuthService` — call `supabase.auth.signInAnonymously()` and pass result through `_upsertUser()` with a placeholder display name
3. `MockAuthService` — stub it
4. UI — add "Continue as guest" button to the auth screen
5. `AuthGate` in `_layout.tsx` — anonymous sessions are valid sessions; verify the gate treats them correctly throughout the app (some screens may need to prompt conversion before performing irreversible actions like settling a payment)

The main design consideration is the conversion prompt: when should the app ask an anonymous user to register? Settling a debt, initiating a payment, and being added to a group by email are all natural trigger points.

**Estimated code changes:** ~80 lines of production code, one new button, conversion prompt logic.

---

### Passwordless magic link (email)

**What it is:** User enters their email, receives a link, taps it, and is signed in instantly. No password needed. The link opens the app via a deep link.

**Why it matters for this app:** Removes the password memory burden entirely for users who use the app infrequently (someone who only splits bills occasionally). Also useful as a fallback if a user has forgotten their password and finds the existing reset flow has too many steps.

**Implementation difficulty: Medium**

Supabase supports it:

```
supabase.auth.signInWithOtp({ email: 'user@example.com', options: { emailRedirectTo: 'ouishare://auth/callback' } })
```

The challenge is deep link handling. The email link contains a token that Supabase embeds in the URL. The app must:

1. Register `ouishare://auth/callback` as a handled deep link scheme (already configured in `app.config.ts`)
2. On launch via that link, extract the token from the URL and call `supabase.auth.exchangeCodeForSession()`
3. Handle the case where the link is opened on a different device than where it was requested

What would need to change:

1. `IAuthService` — add `sendMagicLink(email)` method
2. `SupabaseAuthService` — implement it
3. `_layout.tsx` — handle incoming deep link in the app's link listener and call `supabase.auth.exchangeCodeForSession()` on the token
4. UI — "Sign in with magic link" option on the auth screen, plus a "check your email" confirmation screen
5. No new native modules needed (Expo's `Linking` API is already available)

The fiddly part is the deep link callback on cold launch: if the user taps the link and the app is not running, it must still handle the token correctly from inside `app/_layout.tsx`'s `useEffect` on mount.

**Estimated code changes:** ~100 lines of production code, one new screen, deep link handler additions.

---

### Facebook / Meta Sign-In

**What it is:** "Continue with Facebook" — user authenticates via the Facebook app or Safari, and the identity token is passed to Supabase.

**Why it matters for this app:** Facebook has strong penetration in France and Southern Europe among the 25–45 demographic. For a social/group expense app, users are likely already in Facebook groups with the people they split bills with.

**Implementation difficulty: High**

The Facebook SDK situation on React Native has historically been difficult. There are two realistic approaches:

**Option A — `react-native-fbsdk-next`** (native SDK)
Requires a Facebook App created in the Meta developer portal, a native module, and passing a Meta app review process before the app can request `email` and `public_profile` scopes in production. The SDK has had repeated breaking changes and Expo Go does not support it — a custom dev client is required.

**Option B — `expo-auth-session` with Facebook OAuth** (web-based)
Uses Expo's browser-based OAuth flow rather than the native Facebook app. Avoids the native SDK entirely. Less smooth UX (opens a browser) but far simpler to implement and maintain.

For Option B:
```
const result = await AuthSession.startAsync({
  authUrl: `https://www.facebook.com/dialog/oauth?client_id=...&redirect_uri=...`
});
// exchange code for access token, then:
supabase.auth.signInWithIdToken({ provider: 'facebook', token: accessToken })
```

What would need to change:
1. Facebook App registration (Meta developer portal) — not a code step but a real-time bottleneck; Meta review can take days
2. `IAuthService` — add `signInWithFacebook()`
3. `SupabaseAuthService` — implement with `expo-auth-session`
4. `MockAuthService` — stub
5. UI — Facebook button on the auth screen
6. Supabase dashboard — enable Facebook provider, add App ID and App Secret

The App review process (required to get real user emails in production) is the main risk factor. Development works with test users immediately, but production requires Meta approval.

**Estimated code changes:** ~100 lines of production code. The Meta developer setup and review process is the actual bottleneck.

---

### Multi-factor authentication (MFA / TOTP)

**What it is:** After signing in with email/password, users are prompted for a code from an authenticator app (Google Authenticator, Authy, etc.). This is a security layer on top of existing auth, not a replacement for it.

**Why it matters for this app:** Once users are managing real money flows (settling debts, initiating bank transfers), MFA becomes relevant for higher-value accounts. It is also increasingly expected by enterprise users and is a trust signal.

**Implementation difficulty: Medium**

Supabase added MFA support in 2023. The flow is:

```
// Enrollment (one-time setup):
const { data } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
// data.totp.qr_code — show this QR in a UI

// Challenge on sign-in:
const challenge = await supabase.auth.mfa.challenge({ factorId })
await supabase.auth.mfa.verify({ factorId, challengeId, code: userEnteredCode })
```

What would need to change:

1. `IAuthService` — add `enrollMfa()`, `verifyMfa(code)`, `unenrollMfa()` methods (or a separate `IMfaService`)
2. `SupabaseAuthService` — implement the three-step enroll/challenge/verify flow
3. UI — settings screen section for enabling/disabling MFA, QR code display using `expo-barcode-scanner` or a QR rendering library, and a secondary verification screen that appears after password sign-in when MFA is enabled
4. `AuthGate` — must detect an `assurance_level` of `aal1` vs `aal2` on the session and redirect to MFA verification if needed

No new native modules are strictly required (QR code generation can be done in pure JS). The main complexity is the session assurance level handling — after password sign-in, if the user has MFA enrolled, the session is at `aal1` and the app must gate certain screens until `aal2` is achieved.

**Estimated code changes:** ~200 lines of production code, two new screens (enrollment, verification), settings integration.

---

### WhatsApp OTP

**What it is:** User receives a one-time code via WhatsApp message rather than SMS. Common in markets where WhatsApp penetration is near-universal (France, Spain, Brazil, India).

**Why it matters for this app:** In France, WhatsApp is effectively the default messenger. Users who see an SMS arriving for a code will occasionally ignore it as spam; a WhatsApp message from a known contact pattern is treated differently. Twilio supports WhatsApp as a channel for OTP delivery.

**Implementation difficulty: Medium** (if phone auth is already implemented), **High** (if starting from scratch)

WhatsApp OTP is not a separate auth mechanism — it is an alternate delivery channel for the same phone OTP flow. Supabase does not natively support WhatsApp delivery. The implementation path is:

1. Implement phone/SMS OTP first (see above)
2. Replace the Twilio SMS delivery with Twilio's WhatsApp channel (`whatsapp:+33612345678` as the `To` number in the Twilio API call)
3. This requires a Twilio WhatsApp Business profile, which requires Meta review (same bottleneck as Facebook Sign-In)

The Supabase-side code does not change. The delivery channel switch happens in the Twilio console configuration. The UX addition is letting the user choose "Send via SMS" or "Send via WhatsApp" at the phone entry step.

**Estimated code changes:** Minimal if phone is already done (~20 lines for the channel toggle). Meta/Twilio approval process is the gating factor.

---

### Summary table

| Provider | Difficulty | Native module | Vendor setup | Supabase native support | Most relevant for this app |
|----------|-----------|---------------|--------------|-------------------------|---------------------------|
| Phone / SMS OTP | Medium | None | Twilio account | Yes | High — European market standard |
| Anonymous / guest | Low | None | None | Yes (native) | High — reduces onboarding friction |
| Magic link (email) | Medium | None | None | Yes | Medium — good low-friction fallback |
| Facebook Sign-In | High | expo-auth-session | Meta developer + review | Yes | Medium — EU social graph overlap |
| MFA / TOTP | Medium | None | None | Yes (native) | Medium — when payment volume grows |
| WhatsApp OTP | Medium–High | None | Twilio + Meta review | Via Twilio | Medium — French market specifically |
| Twitter/X | High | expo-auth-session | Twitter developer + approval | Yes | Low — API instability, low user demand |
| Microsoft / SSO | High | expo-auth-session | Azure AD tenant | Yes | Low — enterprise only |

**Recommended sequence if expanding auth:**

1. **Guest sign-in first** — lowest effort, highest friction reduction, database groundwork already laid
2. **Phone / SMS OTP second** — most expected by European users without a Google/Apple preference
3. **Magic link third** — low effort, good complement to existing email/password flow
4. **Facebook and MFA** — defer until there is clear user demand (Facebook) or payment volume that warrants the security layer (MFA)
