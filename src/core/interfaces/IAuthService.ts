import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { User } from '../models/User';

export type AuthStateListener = (user: User | null) => void;
export type Unsubscribe = () => void;

export interface IAuthService {
  signIn(email: string, password: string): Promise<Result<User, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
  // Guest path: creates an anonymous session with a display name.
  // isGuest: true on the resulting User; upgradeable to a full account later.
  signInAsGuest(name: string): Promise<Result<User, AppError>>;
  // Returns the currently authenticated user synchronously, or null.
  currentUser(): User | null;
  // Subscribe to auth state changes (equivalent to currentUser$ observable).
  // Returns an unsubscribe function.
  onAuthStateChange(listener: AuthStateListener): Unsubscribe;
}
