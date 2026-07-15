import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IAuthService, AuthStateListener, Unsubscribe } from '../../core/interfaces/IAuthService';
import type { User } from '../../core/models/User';
import { supabase, supabaseUrl, pingSupabase } from './supabaseClient';
import { LargeSecureStore } from './LargeSecureStore';
import { canonicalizeEmail } from '../../core/utils/emailValidation';

// Expo Router renders the root layout twice in concurrent mode, and Metro can
// evaluate the same module file from two differently-resolved import paths,
// giving each evaluation its own module-level closure. A module-level variable
// alone is not sufficient — both evaluations start with null. Storing the
// instance on globalThis (same technique as __weShareContainerPromise in
// ServiceContext.tsx) ensures there is exactly one SupabaseAuthService per JS
// runtime regardless of how many times this module is evaluated.
declare global {
  // eslint-disable-next-line no-var
  var __weShareAuthService: SupabaseAuthService | undefined;
}

export function getAuthService(): SupabaseAuthService {
  const existed = !!globalThis.__weShareAuthService;
  if (!existed) {
    globalThis.__weShareAuthService = new SupabaseAuthService();
  }
  Sentry.addBreadcrumb({
    category: 'auth',
    message:  `get_auth_service: ${existed ? 'reused_singleton' : 'created_new_instance'}`,
    level:    existed ? 'info' : 'warning',
  });
  return globalThis.__weShareAuthService;
}

// GoTrue returns non-JSON (plain text or HTML) during cold-start, causing the
// native HTTP stack to throw a JSON parse error before the Supabase SDK can
// normalise it. Detect that pattern and surface a human-readable message.
function coldStartMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes('JSON Parse error') || raw.includes('Unexpected character')) {
    return 'Server is starting up — please try again in a moment.';
  }
  return raw;
}

export class SupabaseAuthService implements IAuthService {
  private _currentUser: User | null = null;
  private _expiresAt: number = 0;
  private _readyPromise: Promise<void>;
  private _readyResolve: () => void = () => {};
  private _initialUserPromise: Promise<User | null> | null = null;

  private static readonly USER_CACHE_KEY = 'weshare_user_v1';

  constructor() {
    this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });
    Sentry.addBreadcrumb({ category: 'auth', message: 'auth_service_constructed', level: 'info' });

    pingSupabase();

    // Resume token auto-refresh when the app comes to the foreground and pause
    // it while backgrounded so we don't hit rate limits or drain battery.
    AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    });

    supabase.auth.onAuthStateChange(async (event, session) => {
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `auth_state_change: ${event} has_session=${!!session?.user}`,
        level:    'info',
        data:     { expires_at: session?.expires_at },
      });
      try {
        // TOKEN_REFRESHED is a transient event during getInitialUser()'s getSession()
        // call. Clearing _currentUser here would race with getInitialUser() setting it,
        // causing load() to see null and bail with an empty trips screen.
        if (event === 'TOKEN_REFRESHED' && session?.user) {
          this._expiresAt = session.expires_at ?? 0;
          return;
        }
        if (!session?.user) {
          this._currentUser = null;
          this._expiresAt   = 0;
          void this._clearUserCache();
          return;
        }
        this._expiresAt = session.expires_at ?? 0;
        // INITIAL_SESSION fires when the SDK replays the stored session to a
        // newly-registered listener. _doGetInitialUser already handles profile
        // loading for that case (cache read or getSession no-cache path), so
        // calling _fetchUser here would fire a redundant DB query concurrently
        // with loadTrips — causing 4 simultaneous cold PostgREST connections at
        // startup. Post-init events (SIGNED_IN, USER_UPDATED) still need this.
        if (event === 'INITIAL_SESSION') return;
        // SIGNED_IN fires on session restore even when the user is already in
        // memory from cache. Calling _fetchUser here would add an extra cold
        // PostgREST connection competing with loadTrips during startup.
        // The deferred _fetchUser in _doGetInitialUser handles the profile
        // refresh; nothing is lost by skipping redundant calls here.
        if (this._currentUser?.id === session.user.id) return;
        const user = await this._fetchUser(session.user.id, session.user.email);
        if (user) this._currentUser = user;
      } catch {
        // Background user sync failed — session state is unchanged.
      }
    });
  }

  // ── Cache helpers ─────────────────────────────────────────────────────────

  private async _readUserCache(): Promise<User | null> {
    try {
      Sentry.addBreadcrumb({ category: 'auth', message: 'user_cache_read_start', level: 'info' });
      const json = await SecureStore.getItemAsync(SupabaseAuthService.USER_CACHE_KEY);
      if (!json) {
        Sentry.addBreadcrumb({ category: 'auth', message: 'user_cache_read: empty', level: 'info' });
        return null;
      }
      const parsed = JSON.parse(json);
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `user_cache_read: id=${String(parsed?.id ?? 'unknown').slice(0, 8)}`,
        level:    'info',
      });
      return { ...parsed, createdAt: new Date(parsed.createdAt) };
    } catch {
      Sentry.addBreadcrumb({ category: 'auth', message: 'user_cache_read: parse_error', level: 'warning' });
      return null;
    }
  }

  private async _writeUserCache(user: User): Promise<void> {
    try {
      Sentry.addBreadcrumb({ category: 'auth', message: `user_cache_write: id=${user.id.slice(0, 8)}`, level: 'info' });
      await SecureStore.setItemAsync(
        SupabaseAuthService.USER_CACHE_KEY,
        JSON.stringify({ ...user, createdAt: user.createdAt.toISOString() }),
      );
    } catch (e) {
      Sentry.captureMessage(
        `user_cache_write_failed: ${e instanceof Error ? e.message : String(e)}`,
        'warning',
      );
    }
  }

  private async _clearUserCache(): Promise<void> {
    Sentry.addBreadcrumb({ category: 'auth', message: 'user_cache_clear', level: 'warning' });
    try { await SecureStore.deleteItemAsync(SupabaseAuthService.USER_CACHE_KEY); } catch {}
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private static async _withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        const t = setTimeout(() => reject(new Error(message ?? `Request timed out after ${ms / 1000}s`)), ms);
        if (typeof t === 'object' && t !== null) t.unref();
      }),
    ]);
  }

  // Retries fn up to maxAttempts times on thrown exceptions (e.g. timeouts).
  // Supabase calls that return {data, error} never throw on auth errors, so
  // wrong-password failures are instant — only genuine network timeouts retry.
  private static async _withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number,
    retryDelayMs: number,
  ): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, retryDelayMs));
      try {
        return await fn();
      } catch (e) {
        if (attempt === maxAttempts - 1) throw e;
      }
    }
    throw new Error('unreachable');
  }

  private async _fetchUser(authId: string, email?: string): Promise<User | null> {
    const t0 = Date.now();
    Sentry.addBreadcrumb({ category: 'auth', message: `fetch_user: id=${authId.slice(0, 8)}`, level: 'info' });
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('id', authId)
      .single();
    Sentry.addBreadcrumb({
      category: 'auth',
      message:  `fetch_user_done: found=${!!data && !error} ms=${Date.now() - t0}`,
      level:    error ? 'warning' : 'info',
      data:     error ? { code: error.code } : undefined,
    });
    if (error || !data) return null;
    return {
      id:        data.id,
      name:      data.display_name,
      email,
      avatarUrl: data.avatar_url ?? undefined,
      createdAt: new Date(data.created_at),
    };
  }

  private async _upsertUser(
    id: string,
    displayName: string,
    avatarUrl?: string,
    email?: string,
  ): Promise<User> {
    const emailFields = email
      ? { email, canonical_email: canonicalizeEmail(email) }
      : {};
    const { data, error } = await supabase
      .from('users')
      .upsert(
        { id, display_name: displayName, avatar_url: avatarUrl ?? null, ...emailFields },
        { onConflict: 'id', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (error || !data) {
      const existing = await this._fetchUser(id);
      if (existing) return existing;
      throw new Error(`Failed to upsert user row: ${error?.message ?? 'unknown'}`);
    }
    return {
      id:        data.id,
      name:      data.display_name,
      avatarUrl: data.avatar_url ?? undefined,
      createdAt: new Date(data.created_at),
    };
  }

  // Best-effort, non-blocking merge of any guest (placeholder) group/trip
  // memberships — and their expenses/splits/split_requests — added under this
  // account's email before it existed, into this account (TODO_userMerge.md
  // Chunk B). Deliberately NOT awaited by callers and NOT wrapped in the
  // signIn/signUp/etc. try/catch the way _upsertUser is — a merge failure
  // must never block sign-in, unlike profile creation. Safe to call on every
  // sign-in: the RPC is idempotent and cheap when there's nothing to merge.
  private _mergeGuestRecords(): void {
    try {
      // supabase.rpc(...)'s typed return is PromiseLike (no .catch) — use the
      // two-argument .then() form to handle both outcomes without depending
      // on a real Promise's extra methods.
      void supabase.rpc('merge_guest_records_for_new_user').then(
        ({ error }) => {
          if (error) Sentry.captureMessage(`merge_guest_records_failed: ${error.message}`, 'warning');
        },
        (e: unknown) => {
          Sentry.captureMessage(`merge_guest_records_threw: ${e instanceof Error ? e.message : String(e)}`, 'warning');
        },
      );
    } catch (e) {
      Sentry.captureMessage(`merge_guest_records_sync_throw: ${e instanceof Error ? e.message : String(e)}`, 'warning');
    }
  }

  // ── IAuthService ──────────────────────────────────────────────────────────

  async signIn(email: string, password: string): Promise<Result<User, AppError>> {
    try {
      const { data, error } = await SupabaseAuthService._withRetry(
        () => SupabaseAuthService._withTimeout(
          supabase.auth.signInWithPassword({ email: email.trim(), password }),
          20_000,
          'Connection timed out — Supabase may be starting up, please try again',
        ),
        3,
        5_000,
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from sign-in' });

      this._expiresAt = data.session?.expires_at ?? 0;
      const user = await this._fetchUser(data.user.id, data.user.email);
      if (!user) return err({ kind: 'AuthError', message: 'User profile not found' });
      this._currentUser = user;
      void this._writeUserCache(user);
      this._mergeGuestRecords();
      return ok(user);
    } catch (e) {
      return err({ kind: 'AuthError', message: coldStartMessage(e) });
    }
  }

  async signUp(
    email: string,
    password: string,
    name: string,
  ): Promise<Result<User | { needsEmailConfirmation: true }, AppError>> {
    const canonical = canonicalizeEmail(email);

    // Fail fast before creating an unverified auth.users row.
    // The UNIQUE constraint on users.canonical_email is the true enforcement;
    // this RPC call just gives a better UX error before the OTP flow.
    try {
      const { data: taken, error: rpcError } = await supabase.rpc('canonical_email_taken', {
        p_canonical: canonical,
      });
      if (!rpcError && taken) {
        return err({ kind: 'AuthError', message: 'An account with this email inbox already exists.' });
      }
    } catch {
      // RPC failure is non-fatal — proceed and let the DB constraint enforce dedup.
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return err({ kind: 'AuthError', message: error.message });
    if (!data.user) return err({ kind: 'AuthError', message: 'Account creation failed' });

    // Supabase returns session=null when email confirmation is required.
    if (!data.session) {
      return ok({ needsEmailConfirmation: true });
    }

    this._expiresAt = data.session.expires_at ?? 0;
    try {
      const user = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, name, undefined, email),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      void this._writeUserCache(this._currentUser);
      this._mergeGuestRecords();
      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async verifyOtp(email: string, token: string, name: string): Promise<Result<User, AppError>> {
    let data: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['data'];
    let error: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['error'];
    try {
      ({ data, error } = await SupabaseAuthService._withTimeout(
        supabase.auth.verifyOtp({ email, token, type: 'signup' }),
        20_000,
        'Connection timed out — please try again',
      ));
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : 'Verification failed' });
    }
    if (error) return err({ kind: 'AuthError', message: error.message });
    if (!data.user) return err({ kind: 'AuthError', message: 'Verification failed' });

    this._expiresAt = data.session?.expires_at ?? 0;
    try {
      const user = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, name, undefined, data.user.email ?? undefined),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      void this._writeUserCache(this._currentUser);
      this._mergeGuestRecords();
      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async resendOtp(email: string): Promise<Result<void, AppError>> {
    try {
      const { error } = await SupabaseAuthService._withTimeout(
        supabase.auth.resend({ type: 'signup', email }),
        20_000,
        'Connection timed out — please try again',
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      return ok(undefined);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : 'Resend failed' });
    }
  }

  async sendPasswordReset(email: string): Promise<Result<{ resolvedEmail: string }, AppError>> {
    const canonical = canonicalizeEmail(email);

    // Look up the actual registered address for this inbox. A user who signed up
    // as user+weshare@gmail.com can enter user@gmail.com and still receive the
    // reset code at their registered plus address.
    let resolvedEmail = email.trim();
    try {
      const { data } = await supabase.rpc('email_for_canonical', { p_canonical: canonical });
      if (typeof data === 'string' && data.length > 0) resolvedEmail = data;
    } catch {
      // Non-fatal — fall back to whatever the user typed.
    }

    try {
      const { error } = await SupabaseAuthService._withTimeout(
        supabase.auth.resetPasswordForEmail(resolvedEmail),
        20_000,
        'Connection timed out — please try again',
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      return ok({ resolvedEmail });
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : 'Request failed' });
    }
  }

  async confirmPasswordReset(
    email: string,
    token: string,
    newPassword: string,
  ): Promise<Result<User, AppError>> {
    try {
      const { data: otpData, error: otpError } = await SupabaseAuthService._withTimeout(
        supabase.auth.verifyOtp({ email, token, type: 'recovery' }),
        20_000,
        'Connection timed out — please try again',
      );
      if (otpError) return err({ kind: 'AuthError', message: otpError.message });
      if (!otpData.user) return err({ kind: 'AuthError', message: 'Verification failed' });

      this._expiresAt = otpData.session?.expires_at ?? 0;

      const { data: updateData, error: updateError } = await SupabaseAuthService._withTimeout(
        supabase.auth.updateUser({ password: newPassword }),
        10_000,
        'Password update timed out — please try again',
      );
      if (updateError) return err({ kind: 'AuthError', message: updateError.message });
      if (!updateData.user) return err({ kind: 'AuthError', message: 'Password update failed' });

      const user = await Promise.race([
        this._fetchUser(updateData.user.id, updateData.user.email),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8_000)),
      ]);
      if (!user) return err({ kind: 'AuthError', message: 'User profile not found — please try again' });

      this._currentUser = user;
      void this._writeUserCache(user);
      return ok(user);
    } catch (e) {
      return err({ kind: 'AuthError', message: coldStartMessage(e) });
    }
  }

  async signOut(): Promise<Result<void, AppError>> {
    const { error } = await supabase.auth.signOut();
    if (error) return err({ kind: 'AuthError', message: error.message });
    this._currentUser = null;
    this._expiresAt   = 0;
    void this._clearUserCache();
    return ok(undefined);
  }

  async debugSignOut(): Promise<void> {
    // supabase.auth.signOut() can hang indefinitely if the SDK's internal lock
    // is held by an in-flight token refresh (e.g. during the startup sequence).
    // Directly wipe SecureStore so the session is gone regardless of SDK state,
    // then fire signOut best-effort so subscribers receive SIGNED_OUT.
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    await Promise.all([
      LargeSecureStore.removeItem(`sb-${projectRef}-auth-token`),
      SecureStore.deleteItemAsync(SupabaseAuthService.USER_CACHE_KEY),
    ]).catch(() => {});
    this._currentUser        = null;
    this._expiresAt          = 0;
    this._initialUserPromise = null;
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  async signInWithGoogle(): Promise<Result<User, AppError>> {
    if (Platform.OS === 'ios') {
      const iosScheme = Constants.expoConfig?.extra?.googleIosUrlScheme as string | undefined;
      if (!iosScheme || iosScheme.includes('placeholder')) {
        return err({ kind: 'AuthError', message: 'Google Sign-In is not configured for this iOS build — contact support.' });
      }
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId: Constants.expoConfig?.extra?.googleWebClientId ?? '' });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken  = userInfo.data?.idToken;

      if (!idToken) return err({ kind: 'AuthError', message: 'No ID token returned from Google' });

      const { data, error } = await SupabaseAuthService._withRetry(
        () => SupabaseAuthService._withTimeout(
          supabase.auth.signInWithIdToken({ provider: 'google', token: idToken }),
          20_000,
          'Connection timed out — Supabase may be starting up, please try again',
        ),
        3,
        5_000,
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from Google sign-in' });

      const displayName = userInfo.data?.user?.name ?? data.user.email?.split('@')[0] ?? 'User';
      const avatarUrl   = userInfo.data?.user?.photo ?? undefined;
      const user        = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, displayName, avatarUrl, data.user.email ?? undefined),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;
      void this._writeUserCache(this._currentUser);
      this._mergeGuestRecords();
      Sentry.addBreadcrumb({ category: 'auth', message: 'signin_google_success', level: 'info' });

      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: coldStartMessage(e) });
    }
  }

  async signInWithApple(): Promise<Result<User, AppError>> {
    if (Platform.OS !== 'ios') {
      return err({ kind: 'AuthError', message: 'Apple Sign-In is only available on iOS' });
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AppleAuth = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
      const available = await AppleAuth.isAvailableAsync();
      if (!available) return err({ kind: 'AuthError', message: 'Apple Sign-In is not available on this device' });

      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) return err({ kind: 'AuthError', message: 'No identity token from Apple' });

      const { data, error } = await SupabaseAuthService._withRetry(
        () => SupabaseAuthService._withTimeout(
          supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken }),
          20_000,
          'Connection timed out — Supabase may be starting up, please try again',
        ),
        3,
        5_000,
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from Apple sign-in' });

      // Apple only provides name on the very first sign-in; fall back gracefully.
      const firstName   = credential.fullName?.givenName  ?? '';
      const lastName    = credential.fullName?.familyName ?? '';
      const displayName = [firstName, lastName].filter(Boolean).join(' ')
        || data.user.email?.split('@')[0]
        || 'User';

      const user        = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, displayName, undefined, data.user.email ?? undefined),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;
      void this._writeUserCache(this._currentUser);
      this._mergeGuestRecords();

      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: coldStartMessage(e) });
    }
  }

  async getInitialUser(): Promise<User | null> {
    const deduped = !!this._initialUserPromise;
    Sentry.addBreadcrumb({ category: 'auth', message: `get_initial_user: deduped=${deduped}`, level: 'info' });
    if (deduped) return this._initialUserPromise!;
    this._initialUserPromise = this._doGetInitialUser();
    return this._initialUserPromise;
  }

  private async _doGetInitialUser(): Promise<User | null> {
    const t0 = Date.now();
    Sentry.addBreadcrumb({ category: 'auth', message: 'do_get_initial_user_start', level: 'info' });
    try {
      // Cache-first: read the stored user profile before touching the network.
      // For every returning user this resolves in ~5 ms. getSession() (which may
      // need a GoTrue round-trip) runs in the background. The Supabase client
      // serialises refresh calls behind an internal lock, so subsequent DB queries
      // automatically wait for the same in-flight refresh rather than racing it.
      // TOKEN_REFRESHED / SIGNED_OUT via onAuthStateChange handles any state change.
      //
      // 5 s ceiling on the SecureStore read — Android Keystore re-initialisation
      // after a process kill can occasionally stall the native call indefinitely.
      // On timeout we fall through to the live getSession() path below.
      let cached: User | null = null;
      try {
        cached = await SupabaseAuthService._withTimeout(this._readUserCache(), 5_000);
      } catch {
        Sentry.captureMessage('user_cache_read_timeout: SecureStore stalled on startup', 'warning');
      }
      if (cached) {
        this._currentUser = cached;
        Sentry.addBreadcrumb({
          category: 'auth',
          message:  `cache_first_return: id=${cached.id.slice(0, 8)} ms=${Date.now() - t0}`,
          level:    'info',
        });
        void supabase.auth.getSession()
          .then(({ data, error }) => {
            if (error) {
              Sentry.captureMessage(`session_bg_error: ${error.message}`, 'warning');
              return;
            }
            if (!data.session) {
              // Session was revoked or refresh token expired while the app was
              // closed. Clear all local auth state immediately so currentUser()
              // returns null, then fire a local signOut to trigger the
              // SIGNED_OUT event — AuthGate's onAuthStateChange listener will
              // receive null and redirect to the sign-in screen.
              Sentry.captureMessage('session_bg_null: revoking cached session', 'warning');
              this._currentUser = null;
              this._expiresAt   = 0;
              void this._clearUserCache();
              void supabase.auth.signOut({ scope: 'local' });
              return;
            }
            this._expiresAt = data.session.expires_at ?? 0;
            const expiresIn = this._expiresAt - Math.floor(Date.now() / 1000);
            Sentry.addBreadcrumb({ category: 'auth', message: `session_bg_ok: expires_in=${expiresIn}s ms=${Date.now() - t0}`, level: 'info' });
            // Defer the profile refresh so it doesn't race with loadTrips on a
            // cold PostgREST connection. Both queries hitting simultaneously caused
            // all startup DB calls to queue behind each other and breach the
            // 15-second loadTrips timeout. The profile fetch is cosmetic
            // (display name / avatar) — a 5-second delay is invisible to the user.
            if (data.session.user.id === cached.id) {
              setTimeout(() => {
                void this._fetchUser(data.session.user.id, data.session.user.email)
                  .then(fresh => {
                    if (fresh) { this._currentUser = fresh; void this._writeUserCache(fresh); }
                  })
                  .catch(() => {});
              }, 5_000);
            }
          })
          .catch(e => Sentry.captureMessage(`session_bg_threw: ${String(e)}`, 'warning'));
        return cached;
      }

      // No cache: first install or post-sign-out.
      // Must wait for a live session before we know who the user is.
      Sentry.addBreadcrumb({ category: 'auth', message: 'no_cache_waiting_session', level: 'info' });
      const sessionPromise = supabase.auth.getSession();
      Sentry.addBreadcrumb({ category: 'auth', message: 'get_session_called', level: 'info' });

      let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>;
      try {
        sessionData = await SupabaseAuthService._withTimeout(sessionPromise, 20_000, 'Server is taking too long to respond — please try again');
        Sentry.addBreadcrumb({
          category: 'auth',
          message:  `get_session_done: ms=${Date.now() - t0} has_session=${!!sessionData.data.session}`,
          level:    'info',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Sentry.captureMessage(`session_restore_error: ${msg}`, 'warning');
        return null;
      }

      const { data } = sessionData;
      if (!data.session?.user) {
        Sentry.captureMessage('session_restore_no_session', 'warning');
        return null;
      }

      this._expiresAt = data.session.expires_at ?? 0;
      const { id: userId, email } = data.session.user;
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `session_found: user=${userId.slice(0, 8)} expires_in=${this._expiresAt - Math.floor(Date.now() / 1000)}s`,
        level:    'info',
      });

      const user = await Promise.race([
        this._fetchUser(userId, email),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8_000)),
      ]);
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `profile_fetch_done: found=${!!user} ms=${Date.now() - t0}`,
        level:    user ? 'info' : 'warning',
      });
      if (user) {
        this._currentUser = user;
        void this._writeUserCache(user);
      }
      return user;
    } finally {
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `auth_ready_resolved: total_ms=${Date.now() - t0}`,
        level:    'info',
      });
      this._readyResolve();
    }
  }

  awaitReady(): Promise<void> {
    return this._readyPromise;
  }

  currentUser(): User | null {
    if (this._expiresAt > 0 && Math.floor(Date.now() / 1000) >= this._expiresAt) {
      return null;
    }
    return this._currentUser;
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `public_auth_change: ${event} session_user=${session?.user?.id?.slice(0, 8) ?? 'null'} current=${this._currentUser?.id?.slice(0, 8) ?? 'null'}`,
        level:    'info',
      });
      try {
        if (!session?.user) { listener(null); return; }

        // INITIAL_SESSION fires when the SDK replays the stored session to a
        // newly registered listener (AuthGate, useTrips, etc.). _doGetInitialUser
        // already handles profile loading, so calling _fetchUser here fires a
        // redundant DB query for every subscriber, concurrent with loadTrips.
        // Use the in-memory user if available; if not yet set (race on first
        // install), getInitialUser() will deliver the user via its own path.
        if (event === 'INITIAL_SESSION') {
          if (this._currentUser?.id === session.user.id) {
            Sentry.addBreadcrumb({ category: 'auth', message: `listener_initial_session_reuse: id=${session.user.id.slice(0, 8)}`, level: 'info' });
            listener(this._currentUser!);
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          // Fast case: _currentUser already populated (warm restart or later refresh).
          if (this._currentUser?.id === session.user.id) {
            Sentry.addBreadcrumb({ category: 'auth', message: 'token_refreshed_reuse_current_user', level: 'info' });
            listener(this._currentUser!);
            return;
          }
          // TOKEN_REFRESHED fired while getInitialUser() is still in flight —
          // the token refresh races with the initial getSession() call, meaning
          // _currentUser has not been set from cache yet. Awaiting _initialUserPromise
          // gives us the cached user without hitting the possibly-sleeping DB.
          if (this._initialUserPromise) {
            Sentry.addBreadcrumb({ category: 'auth', message: 'token_refreshed_awaiting_initial_promise', level: 'info' });
            const initialUser = await this._initialUserPromise;
            if (initialUser?.id === session.user.id) {
              Sentry.addBreadcrumb({ category: 'auth', message: 'token_refreshed_got_from_initial_promise', level: 'info' });
              listener(initialUser);
            } else {
              Sentry.addBreadcrumb({
                category: 'auth',
                message:  `token_refreshed_id_mismatch: initial=${initialUser?.id?.slice(0, 8) ?? 'null'}`,
                level:    'warning',
              });
            }
            return;
          }
          // No initial promise yet — extremely early event, fall through to _fetchUser.
          Sentry.addBreadcrumb({ category: 'auth', message: 'token_refreshed_no_promise_fallthrough', level: 'warning' });
        }

        // Same as the private handler: skip the DB round-trip if the user is
        // already in memory. Prevents redundant cold-start connections.
        if (this._currentUser?.id === session.user.id) {
          Sentry.addBreadcrumb({ category: 'auth', message: `listener_reuse_current: id=${session.user.id.slice(0, 8)}`, level: 'info' });
          listener(this._currentUser!);
          return;
        }
        const user = await this._fetchUser(session.user.id, session.user.email);
        if (user) {
          Sentry.addBreadcrumb({ category: 'auth', message: `listener_called: id=${user.id.slice(0, 8)}`, level: 'info' });
          listener(user);
        } else {
          Sentry.addBreadcrumb({ category: 'auth', message: 'listener_skipped: fetch_returned_null', level: 'warning' });
        }
      } catch (e) {
        Sentry.addBreadcrumb({
          category: 'auth',
          message:  `listener_skipped: fetch_threw ${e instanceof Error ? e.message : String(e)}`,
          level:    'warning',
        });
      }
    });
    return () => data.subscription.unsubscribe();
  }
}
