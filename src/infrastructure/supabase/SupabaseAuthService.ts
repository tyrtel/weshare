import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IAuthService, AuthStateListener, Unsubscribe } from '../../core/interfaces/IAuthService';
import type { User } from '../../core/models/User';
import { supabase, pingSupabase } from './supabaseClient';

export class SupabaseAuthService implements IAuthService {
  private _currentUser: User | null = null;
  private _expiresAt: number = 0;
  private _readyPromise: Promise<void>;
  private _readyResolve: () => void = () => {};

  private static readonly USER_CACHE_KEY = 'weshare_user_v1';

  constructor() {
    this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });

    // Wake up a potentially paused free-tier Supabase project before any
    // authenticated requests are made.
    pingSupabase();

    supabase.auth.onAuthStateChange(async (event, session) => {
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
          return;
        }
        this._expiresAt = session.expires_at ?? 0;
        // Only overwrite _currentUser when the row is actually found. The event
        // may fire before _upsertUser completes on first sign-in, returning null
        // and wiping out the value set by the sign-in method.
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
      const json = await SecureStore.getItemAsync(SupabaseAuthService.USER_CACHE_KEY);
      if (!json) return null;
      const parsed = JSON.parse(json);
      return { ...parsed, createdAt: new Date(parsed.createdAt) };
    } catch {
      return null;
    }
  }

  private async _writeUserCache(user: User): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        SupabaseAuthService.USER_CACHE_KEY,
        JSON.stringify({ ...user, createdAt: user.createdAt.toISOString() }),
      );
    } catch {}
  }

  private async _clearUserCache(): Promise<void> {
    try { await SecureStore.deleteItemAsync(SupabaseAuthService.USER_CACHE_KEY); } catch {}
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private static async _withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(message ?? `Request timed out after ${ms / 1000}s`)), ms),
      ),
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
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('id', authId)
      .single();
    if (error || !data) return null;
    return {
      id:        data.id,
      name:      data.display_name,
      email,
      avatarUrl: data.avatar_url ?? undefined,
      createdAt: new Date(data.created_at),
    };
  }

  private async _upsertUser(id: string, displayName: string, avatarUrl?: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .upsert(
        { id, display_name: displayName, avatar_url: avatarUrl ?? null },
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

  // ── IAuthService ──────────────────────────────────────────────────────────

  async signIn(email: string, password: string): Promise<Result<User, AppError>> {
    try {
      const { data, error } = await SupabaseAuthService._withRetry(
        () => SupabaseAuthService._withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
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
      return ok(user);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      return err({ kind: 'AuthError', message: msg });
    }
  }

  async signUp(
    email: string,
    password: string,
    name: string,
  ): Promise<Result<User | { needsEmailConfirmation: true }, AppError>> {
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
        this._upsertUser(data.user.id, name),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      void this._writeUserCache(this._currentUser);
      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async verifyOtp(email: string, token: string, name: string): Promise<Result<User, AppError>> {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) return err({ kind: 'AuthError', message: error.message });
    if (!data.user) return err({ kind: 'AuthError', message: 'Verification failed' });

    this._expiresAt = data.session?.expires_at ?? 0;
    try {
      const user = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, name),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      void this._writeUserCache(this._currentUser);
      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
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

  async signInWithGoogle(): Promise<Result<User, AppError>> {
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
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
        this._upsertUser(data.user.id, displayName, avatarUrl),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;
      void this._writeUserCache(this._currentUser);

      return ok(this._currentUser);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Google sign-in failed';
      return err({ kind: 'AuthError', message: msg });
    }
  }

  async signInWithApple(): Promise<Result<User, AppError>> {
    if (Platform.OS !== 'ios') {
      return err({ kind: 'AuthError', message: 'Apple Sign-In is only available on iOS' });
    }
    try {
      const AppleAuth = await import('expo-apple-authentication');
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
        this._upsertUser(data.user.id, displayName),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;
      void this._writeUserCache(this._currentUser);

      return ok(this._currentUser);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Apple sign-in failed';
      return err({ kind: 'AuthError', message: msg });
    }
  }

  async getInitialUser(): Promise<User | null> {
    try {
      // getSession() triggers a token refresh when the JWT is expired. On a
      // paused free-tier Supabase project that refresh can hang indefinitely,
      // keeping _readyResolve blocked and freezing the trips screen forever.
      // When saved credentials exist the JWT may be expired, requiring a network
      // round-trip to refresh it. Three attempts × 15 s + 5 s gaps = ~55 s total,
      // enough to survive a free-tier cold start without kicking the user to login.
      let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>;
      try {
        sessionData = await SupabaseAuthService._withRetry(
          () => SupabaseAuthService._withTimeout(
            supabase.auth.getSession(),
            15_000,
            'Session restore timed out',
          ),
          3,
          5_000,
        );
      } catch {
        return null;
      }
      const { data } = sessionData;
      if (!data.session?.user) return null;

      this._expiresAt = data.session.expires_at ?? 0;
      const { id: userId, email } = data.session.user;

      // Fast path: return cached profile immediately, refresh DB in background.
      // Eliminates the DB round-trip on every warm restart so the app opens instantly.
      const cached = await this._readUserCache();
      if (cached?.id === userId) {
        this._currentUser = cached;
        this._fetchUser(userId, email)
          .then(fresh => {
            if (fresh) {
              this._currentUser = fresh;
              void this._writeUserCache(fresh);
            }
          })
          .catch(() => {});
        return cached;
      }

      // Cache miss (first install or after sign-out): fetch with a timeout so a
      // cold-start Supabase pause never blocks the app indefinitely.
      const user = await Promise.race([
        this._fetchUser(userId, email),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8_000)),
      ]);
      if (user) {
        this._currentUser = user;
        void this._writeUserCache(user);
      }
      return user;
    } finally {
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
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (!session?.user) { listener(null); return; }
        const user = await this._fetchUser(session.user.id, session.user.email);
        // Only notify listeners when the row is found. If null, the sign-in method
        // will navigate directly, so we must not call listener(null) and send
        // AuthGate back to the auth screen.
        if (user) listener(user);
      } catch {
        // Background user fetch failed — listener not notified, session unchanged.
      }
    });
    return () => data.subscription.unsubscribe();
  }
}
