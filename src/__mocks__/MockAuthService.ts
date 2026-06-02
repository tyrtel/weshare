import { ok } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IAuthService, AuthStateListener, Unsubscribe } from '../core/interfaces/IAuthService';
import type { User } from '../core/models/User';

export class MockAuthService implements IAuthService {
  private _currentUser: User | null = null;
  private _listeners: Set<AuthStateListener> = new Set();

  private _notify(user: User | null): void {
    for (const listener of this._listeners) {
      listener(user);
    }
  }

  async signIn(email: string, _password: string): Promise<Result<User, AppError>> {
    const user: User = {
      id: `user_${email}`,
      name: email.split('@')[0],
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

  async signInAsGuest(name: string): Promise<Result<User, AppError>> {
    const user: User = {
      id: `guest_${name.trim().toLowerCase().replace(/\s+/g, '_')}`,
      name,
      createdAt: new Date(),
    };
    this._currentUser = user;
    this._notify(user);
    return ok(user);
  }

  currentUser(): User | null {
    return this._currentUser;
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
}
