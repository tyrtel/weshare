import { Platform } from 'react-native';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IAuthService, AuthStateListener, Unsubscribe } from '../../core/interfaces/IAuthService';
import type { User } from '../../core/models/User';
import { supabase } from './supabaseClient';

export class SupabaseAuthService implements IAuthService {
  private _currentUser: User | null = null;
  private _expiresAt: number = 0;

  constructor() {
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        this._currentUser = null;
        this._expiresAt   = 0;
        return;
      }
      this._expiresAt   = session.expires_at ?? 0;
      this._currentUser = await this._fetchUser(session.user.id, session.user.email);
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

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
      isGuest:   data.is_guest ?? false,
      createdAt: new Date(data.created_at),
    };
  }

  private async _upsertUser(id: string, displayName: string, avatarUrl?: string, isGuest = false): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .upsert(
        { id, display_name: displayName, avatar_url: avatarUrl ?? null, is_guest: isGuest },
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
      isGuest:   data.is_guest ?? false,
      createdAt: new Date(data.created_at),
    };
  }

  // ── IAuthService ──────────────────────────────────────────────────────────

  async signIn(email: string, password: string): Promise<Result<User, AppError>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return err({ kind: 'AuthError', message: error.message });
    if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from sign-in' });

    this._expiresAt = data.session?.expires_at ?? 0;
    const user = await this._fetchUser(data.user.id, data.user.email);
    if (!user) return err({ kind: 'AuthError', message: 'User profile not found' });
    this._currentUser = user;
    return ok(user);
  }

  async signOut(): Promise<Result<void, AppError>> {
    const { error } = await supabase.auth.signOut();
    if (error) return err({ kind: 'AuthError', message: error.message });
    this._currentUser = null;
    this._expiresAt   = 0;
    return ok(undefined);
  }

  async signInAsGuest(name: string): Promise<Result<User, AppError>> {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) return err({ kind: 'AuthError', message: error.message });
    if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from anonymous sign-in' });

    this._expiresAt = data.session?.expires_at ?? 0;
    try {
      const user = await this._upsertUser(data.user.id, name, undefined, true);
      this._currentUser = user;
      return ok(user);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async signInWithGoogle(): Promise<Result<User, AppError>> {
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken  = userInfo.data?.idToken;

      if (!idToken) return err({ kind: 'AuthError', message: 'No ID token returned from Google' });

      const previousGuestId = this._currentUser?.isGuest ? this._currentUser.id : null;

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token:    idToken,
      });
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from Google sign-in' });

      const displayName = userInfo.data?.user?.name ?? data.user.email?.split('@')[0] ?? 'User';
      const avatarUrl   = userInfo.data?.user?.photo ?? undefined;
      const user        = await this._upsertUser(data.user.id, displayName, avatarUrl, false);
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;

      if (previousGuestId) await this.recoverGuestSession(previousGuestId);

      return ok(this._currentUser);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Google sign-in failed';
      // User cancelled — don't treat as an error worth alerting
      if (msg.includes('SIGN_IN_CANCELLED') || msg.includes('PLAY_SERVICES_NOT_AVAILABLE')) {
        return err({ kind: 'AuthError', message: msg });
      }
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

      const previousGuestId = this._currentUser?.isGuest ? this._currentUser.id : null;

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token:    credential.identityToken,
      });
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from Apple sign-in' });

      // Apple only provides name on the very first sign-in; fall back gracefully.
      const firstName   = credential.fullName?.givenName  ?? '';
      const lastName    = credential.fullName?.familyName ?? '';
      const displayName = [firstName, lastName].filter(Boolean).join(' ')
        || data.user.email?.split('@')[0]
        || 'User';

      const user        = await this._upsertUser(data.user.id, displayName, undefined, false);
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;

      if (previousGuestId) await this.recoverGuestSession(previousGuestId);

      return ok(this._currentUser);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Apple sign-in failed';
      return err({ kind: 'AuthError', message: msg });
    }
  }

  async recoverGuestSession(guestUserId: string): Promise<Result<void, AppError>> {
    if (!guestUserId || guestUserId === this._currentUser?.id) return ok(undefined);
    // Best-effort — a failure here must not fail the sign-in.
    const { error } = await supabase.rpc('claim_guest_session', { old_user_id: guestUserId });
    if (error) console.warn('[recoverGuestSession] RPC failed (non-fatal):', error.message);
    return ok(undefined);
  }

  async getInitialUser(): Promise<User | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return null;
    return this._fetchUser(data.session.user.id, data.session.user.email);
  }

  currentUser(): User | null {
    if (this._expiresAt > 0 && Math.floor(Date.now() / 1000) >= this._expiresAt) {
      return null;
    }
    return this._currentUser;
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) { listener(null); return; }
      const user = await this._fetchUser(session.user.id, session.user.email);
      listener(user);
    });
    return () => data.subscription.unsubscribe();
  }
}
