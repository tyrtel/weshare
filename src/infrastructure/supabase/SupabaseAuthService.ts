import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IAuthService, AuthStateListener, Unsubscribe } from '../../core/interfaces/IAuthService';
import type { User } from '../../core/models/User';
import { supabase } from './supabaseClient';

export class SupabaseAuthService implements IAuthService {
  private _currentUser: User | null = null;
  // Unix timestamp (seconds) when the cached session expires; 0 = no active session.
  private _expiresAt: number = 0;

  constructor() {
    // Keep _currentUser in sync whenever auth state changes (including TOKEN_REFRESHED).
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
      id: data.id,
      name: data.display_name,
      email,
      avatarUrl: data.avatar_url ?? undefined,
      createdAt: new Date(data.created_at),
    };
  }

  private async _insertUser(id: string, displayName: string, avatarUrl?: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert({ id, display_name: displayName, avatar_url: avatarUrl ?? null })
      .select()
      .single();
    if (error || !data) {
      // If insert fails (e.g. row already exists), fall back to fetching
      const existing = await this._fetchUser(id);
      if (existing) return existing;
      throw new Error(`Failed to create user row: ${error?.message ?? 'unknown'}`);
    }
    return {
      id: data.id,
      name: data.display_name,
      avatarUrl: data.avatar_url ?? undefined,
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
      const user = await this._insertUser(data.user.id, name);
      this._currentUser = user;
      return ok(user);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  currentUser(): User | null {
    // Return null if the cached session has already expired locally.
    // _expiresAt = 0 means no expiry info was recorded (e.g. unit tests) — skip the check.
    if (this._expiresAt > 0 && Math.floor(Date.now() / 1000) >= this._expiresAt) {
      return null;
    }
    return this._currentUser;
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        listener(null);
        return;
      }
      const user = await this._fetchUser(session.user.id, session.user.email);
      listener(user);
    });
    return () => data.subscription.unsubscribe();
  }
}
