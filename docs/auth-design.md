# Auth Design: Supabase Authentication in WeShare

This document covers the auth data model, token lifecycles, storage strategy, rehydration
flow, and platform-specific setup for Android Google Sign-In. It is grounded in the actual
implementation in `src/infrastructure/supabase/SupabaseAuthService.ts`.

---

## The Supabase session object

When any sign-in succeeds, Supabase returns a `Session`:

```
Session {
  access_token   — signed JWT, default TTL: 1 hour
  refresh_token  — opaque string, default TTL: never expires
  expires_at     — Unix timestamp (seconds) when access_token dies
  expires_in     — seconds remaining
  token_type     — always "bearer"
  user           — User object (id, email, app_metadata, user_metadata)
}
```

The `access_token` is what every Supabase API and RLS call uses. It is a standard JWT
signed with your project's JWT secret — the `sub` (user UUID), `exp`, `role`, and custom
claims can all be read by decoding it without a network call.

The `refresh_token` is what lets Supabase issue a fresh `access_token` when the current
one expires, without requiring the user to re-enter credentials.

---

## Email/password: round trips and provisioning

**Sign-up:**

1. `POST /auth/v1/signup` — creates the `auth.users` row, sends a confirmation email
2. If email confirmation is enabled: response is `{ user, session: null }` — no session yet
3. User clicks the link → OTP verification: `POST /auth/v1/verify` → returns full session
4. App calls `_upsertUser()` to write the `public.users` profile row

Total: 2 network calls before the user is fully provisioned (`signUp()` → `verifyOtp()`).

**Sign-in (returning user):**

1. `POST /auth/v1/token?grant_type=password` → full session in one round trip

The 20-second timeout with 3 retries at 5-second intervals exists because GoTrue (the
Supabase auth server) cold-starts on the free tier and can return non-JSON for the first
request, causing an SDK-level JSON parse error before the error handler runs.

---

## Google Sign-In: round trips and tokens

The implementation uses the native SDK path (`@react-native-google-signin/google-signin`)
rather than a WebView redirect. This is the correct approach for Android.

1. `GoogleSignin.signIn()` — opens the OS-native Google account picker, returns
   `{ idToken, user }`. This is a local Play Services call, not an HTTP round trip.
   The `idToken` is a short-lived JWT (~1 hour) signed by Google.
2. `POST /auth/v1/token?grant_type=id_token` — Supabase validates the Google JWT against
   Google's JWKS endpoint, creates or finds the `auth.users` row, returns a Supabase session.

The Google `idToken` is a one-shot pass-through — pass it to Supabase and discard it.

**What you do not need from Google after step 2:**

- Google `accessToken` — only needed if calling Google APIs directly, which WeShare does not
- Google `refreshToken` — Supabase refreshes its own session independently of Google
- Google `serverAuthCode` — only needed if a backend server calls Google APIs on behalf of the user

---

## What gets stored and where

### In memory (process lifetime)

```
SupabaseAuthService._currentUser  — the app's User model (id, name, email, avatarUrl)
SupabaseAuthService._expiresAt    — Unix timestamp for fast expiry check in currentUser()
                                    Sentinel value: 0 means "skip the expiry check entirely".
                                    This state occurs when Supabase omits expires_at from a
                                    session response (e.g. some mock sessions, edge cases in
                                    the GoTrue SDK). It is not epoch time (1970).
supabase client internals         — the full Session, managed by the GoTrue JS client
```

### In SecureStore (survives app restart)

Two separate storage domains:

**1. The Supabase session** — written and read automatically by the Supabase client via
the `LargeSecureStore` adapter (registered in `supabaseClient.ts`):

```
Key:   sb-<project-ref>-auth-token  (managed by GoTrue SDK)
Value: full Session JSON — access_token, refresh_token, expires_at, user object
```

**2. The user profile cache** — written by `_writeUserCache()`, read by `_readUserCache()`:

```
Key:   weshare_user_v1
Value: { id, name, email, avatarUrl, createdAt }
```

This cache exists to make warm restarts instant without waiting for GoTrue.

### Why SecureStore, not AsyncStorage

On Android, SecureStore is backed by the Android Keystore system — hardware-backed on
devices with a secure element, software-backed otherwise. The encrypted data lives in the
app's private data partition, is inaccessible to other apps, survives app updates, and is
wiped on factory reset or PIN removal.

AsyncStorage is unencrypted. Its contents are readable from the filesystem on rooted
devices. Never store tokens there.

### Why LargeSecureStore

`expo-secure-store` caps each value at ~2 048 bytes. The Supabase session JSON — which
includes the full `access_token` JWT, `refresh_token`, and the `user` object — can exceed
that limit. `LargeSecureStore` chunks long values at 1 800 bytes across multiple keys,
tracking the count in a separate `_n` key. On reads it reassembles the chunks; on writes
it clears any previous layout before writing so stale chunks from a differently-sized
previous value cannot shadow the new one.

---

## The rehydration path, step by step

This is the most operationally complex part of auth and the source of the cold-start hang.

**Step 1 — Supabase client module loads** (`src/infrastructure/supabase/supabaseClient.ts`)

The `createClient()` call reads `LargeSecureStore` looking for a persisted session. If it
finds one and the `access_token` is expired, it **immediately queues a background token
refresh** (`POST /auth/v1/token?grant_type=refresh_token`). This happens before anything
in application code runs.

**Step 2 — `SupabaseAuthService` is constructed**

Two `supabase.auth.onAuthStateChange` subscriptions are active during normal app operation
and that is intentional:

- **Internal listener** — registered in the constructor. Handles `TOKEN_REFRESHED`,
  `SIGNED_OUT`, and all other GoTrue events to keep `_currentUser` and `_expiresAt` in
  sync. Contains the `TOKEN_REFRESHED` fast-path logic that avoids clearing `_currentUser`
  mid-load.
- **External listener** — registered each time a caller invokes the public
  `onAuthStateChange()` method (e.g. `AuthGate`). Delivers `User | null` to the UI layer.
  Each caller gets its own Supabase subscription and an unsubscribe function.

The module-level singleton (`getAuthService()`) ensures exactly one `SupabaseAuthService`
instance exists per JS bundle, so the internal listener is never duplicated. The external
listener count equals the number of active `onAuthStateChange` callers (normally one:
`AuthGate`).

If the token refresh from Step 1 is already in flight, `TOKEN_REFRESHED` will fire at
some point during or after construction. `pingSupabase()` fires here to wake GoTrue before
`getSession()` is actually awaited.

**Step 3 — `getInitialUser()` is called** (from `AuthGate` or equivalent)

```
getInitialUser()
  │
  ├─ _readUserCache()  →  found?
  │     YES →  return User immediately (~5 ms)
  │              └─ getSession() fires in background to validate + refresh cache
  │
  └─  NO  →  await getSession()  (20-second timeout)
                  └─ waits for in-flight refresh from Step 1 if one is running
                       └─ on success: _fetchUser() → _writeUserCache() → return User
```

**Where the hang comes from:**

When the "NO" branch runs (first install or post-sign-out), `getSession()` must wait for
the background token refresh from Step 1 to complete before it can return. If GoTrue is
cold-starting on the free tier, that refresh takes 10–30 seconds. `pingSupabase()` helps
by initiating a connection earlier, but does not eliminate the wait.

The `weshare_user_v1` cache eliminates this entirely for returning users. The only scenario
where a returning user hits the slow path is if the app crashed between sign-in and
`_writeUserCache()` completing, leaving a valid Supabase session in SecureStore but no
profile cache.

**The TOKEN_REFRESHED race:**

The `onAuthStateChange` listener in the constructor skips clearing `_currentUser` when
`TOKEN_REFRESHED` fires, because this event can arrive while `getInitialUser()` is still
reading the cache. Clearing the user at that moment would cause the initial load to see
`null` and render an empty state. The public `onAuthStateChange` (used by `AuthGate`) has
matching logic: on `TOKEN_REFRESHED` it reuses `_currentUser` if the ID matches, or awaits
`_initialUserPromise` if the cache read is still in flight.

---

## Supabase Dashboard settings that affect rehydration

**JWT expiry (default: 3600 s)**

Increasing this to e.g. 7200 s reduces how often the background refresh is needed on
startup, shrinking the window where a cold-start GoTrue can block the launch.

**Refresh token rotation (recommended: on)**

When enabled, each `POST /auth/v1/token?grant_type=refresh_token` returns a new refresh
token and invalidates the old one. This prevents replay attacks. The pre-clear + rewrite
pattern in `LargeSecureStore.setItem()` handles the case where a crash between invalidation
and storage write could strand the user.

**Refresh token reuse detection**

When rotation is on, Supabase can detect if an already-invalidated token is reused (e.g.
two app instances, or a crash-then-restore scenario) and optionally revoke all sessions for
that user. This can cause unexpected logouts — worth knowing about before enabling.

---

## Android Google Sign-In: the three required pieces

For `@react-native-google-signin/google-signin` to work on Android, three things must be
aligned:

**1. `google-services.json`** in `android/app/`

Obtained from Firebase Console (or Google Cloud Console directly). Contains the Android
OAuth client ID. Required for the Play Services account picker to function.

**2. SHA-1 certificate fingerprints** registered in Google Cloud Console

The Android OAuth client is keyed to your app's signing certificate. Two must be registered:

- Debug SHA-1 — from your local keystore:
  ```
  keytool -list -v -keystore ~/.android/debug.keystore
  ```
- Release SHA-1 — from your EAS signing keystore

If the SHA-1 is wrong or missing, `GoogleSignin.signIn()` fails silently or returns no
`idToken`.

**3. `webClientId` in `GoogleSignin.configure()`**

This must be the **Web** client ID from Google Cloud Console, not the Android client ID.
Supabase's `signInWithIdToken` validates the `aud` claim in the Google JWT against the web
client ID. The Android client ID is what triggers the native account picker; the web client
ID is what gets embedded in the `idToken`. Both are needed but only the web one is passed
to `GoogleSignin.configure()`.

WeShare reads this from `Constants.expoConfig.extra.googleWebClientId` (set in
`app.config.ts`), which keeps the client ID out of source and configurable per environment.

---

## What to store and what to never store

| Data | Where | Notes |
|---|---|---|
| Supabase session (access + refresh token) | SecureStore via LargeSecureStore | Written automatically by the SDK |
| User profile cache | SecureStore (`weshare_user_v1`) | Written by `_writeUserCache()` |
| Google `idToken` | Nowhere — discard after Supabase call | One-shot pass-through |
| Google `accessToken` | Nowhere | Not needed; WeShare calls no Google APIs |
| Passwords | Nowhere | Supabase auth handles bcrypt server-side |
| JWT signing secret | Nowhere client-side | Lives only on the Supabase server |

---

## Relevant source files

```
src/infrastructure/supabase/supabaseClient.ts       Supabase client init, LargeSecureStore wiring
src/infrastructure/supabase/SupabaseAuthService.ts  All auth logic — sign-in, rehydration, caching
src/infrastructure/supabase/LargeSecureStore.ts     Chunked SecureStore adapter
src/core/interfaces/IAuthService.ts                 Auth service contract
src/__mocks__/MockAuthService.ts                    In-memory implementation for tests
```
