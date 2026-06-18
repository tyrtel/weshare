import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { User } from '../models/User';

export type AuthStateListener = (user: User | null) => void;
export type Unsubscribe = () => void;

export interface IAuthService {
  signIn(email: string, password: string): Promise<Result<User, AppError>>;
  // signUp returns { needsEmailConfirmation: true } when Supabase requires
  // the user to click a verification link before the session is active.
  signUp(email: string, password: string, name: string): Promise<Result<User | { needsEmailConfirmation: true }, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
  signInWithGoogle(): Promise<Result<User, AppError>>;
  signInWithApple(): Promise<Result<User, AppError>>;
  // Returns the currently authenticated user synchronously, or null.
  currentUser(): User | null;
  // Resolves once the initial session has been restored from storage.
  // Use this in the auth gate to avoid flashing /auth on relaunch.
  getInitialUser(): Promise<User | null>;
  // Resolves as soon as getInitialUser() has completed. Safe to await before
  // calling currentUser() on screens that mount before auth is restored.
  awaitReady(): Promise<void>;
  // Subscribe to auth state changes. Returns an unsubscribe function.
  onAuthStateChange(listener: AuthStateListener): Unsubscribe;
}
