import { ok } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IAuthService, AuthStateListener, Unsubscribe } from '../core/interfaces/IAuthService';
import type { User } from '../core/models/User';

const SIM_PROFILES: Record<string, { name: string; avatarUrl: string }> = {
  'jay@sim.local': {
    name:      'Jay McCleery',
    avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocJFNrgXPuCE0bw1Ze8UM9tsWcNC9-RHJ57qAqfTJT2BPNldnfA=s96-c',
  },
};

export class MockAuthService implements IAuthService {
  private _currentUser: User | null = null;
  private _listeners: Set<AuthStateListener> = new Set();

  private _notify(user: User | null): void {
    for (const listener of this._listeners) {
      listener(user);
    }
  }

  async signIn(email: string, _password: string): Promise<Result<User, AppError>> {
    const profile = SIM_PROFILES[email];
    const user: User = {
      id:        `user_${email}`,
      name:      profile?.name ?? (() => { const p = email.split('@')[0]; return p.charAt(0).toUpperCase() + p.slice(1); })(),
      email,
      createdAt: new Date(),
      ...(profile?.avatarUrl && { avatarUrl: profile.avatarUrl }),
    };
    this._currentUser = user;
    this._notify(user);
    return ok(user);
  }

  async signUp(
    email: string,
    _password: string,
    name: string,
  ): Promise<Result<User | { needsEmailConfirmation: true }, AppError>> {
    const user: User = {
      id: `user_${email}`,
      name,
      email,
      createdAt: new Date(),
    };
    this._currentUser = user;
    this._notify(user);
    return ok(user);
  }

  async verifyOtp(email: string, _token: string, name: string): Promise<Result<User, AppError>> {
    const user: User = {
      id: `user_${email}`,
      name,
      email,
      createdAt: new Date(),
    };
    this._currentUser = user;
    this._notify(user);
    return ok(user);
  }

  async resendOtp(_email: string): Promise<Result<void, AppError>> {
    return ok(undefined);
  }

  async sendPasswordReset(email: string): Promise<Result<{ resolvedEmail: string }, AppError>> {
    return ok({ resolvedEmail: email.trim() });
  }

  async confirmPasswordReset(email: string, _token: string, _newPassword: string): Promise<Result<User, AppError>> {
    const user: User = {
      id: `user_${email}`,
      name: email.split('@')[0] ?? 'User',
      email,
      createdAt: new Date(),
    };
    this._currentUser = user;
    this._notify(user);
    return ok(user);
  }

  async signOut(): Promise<Result<void, AppError>> {
    this._currentUser = null;
    this._notify(null);
    return ok(undefined);
  }

  async signInWithGoogle(): Promise<Result<User, AppError>> {
    const user: User = {
      id: 'google_mock_user',
      name: 'Google User',
      email: 'google@example.com',
      createdAt: new Date(),
    };
    this._currentUser = user;
    this._notify(user);
    return ok(user);
  }

  async signInWithApple(): Promise<Result<User, AppError>> {
    const user: User = {
      id: 'apple_mock_user',
      name: 'Apple User',
      email: 'apple@example.com',
      createdAt: new Date(),
    };
    this._currentUser = user;
    this._notify(user);
    return ok(user);
  }

  currentUser(): User | null {
    return this._currentUser;
  }

  async getInitialUser(): Promise<User | null> {
    return this._currentUser;
  }

  awaitReady(): Promise<void> {
    return Promise.resolve();
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  async debugSignOut(): Promise<void> {
    this._currentUser = null;
    this._notify(null);
  }
}
