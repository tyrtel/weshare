import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { User } from '../models/User';

export type AuthStateListener = (user: User | null) => void;
export type Unsubscribe = () => void;

export interface IAuthService {
  signIn(email: string, password: string): Promise<Result<User, AppError>>;
  // signUp returns { needsEmailConfirmation: true } when Supabase requires
  // OTP verification before the session is active.
  signUp(email: string, password: string, name: string): Promise<Result<User | { needsEmailConfirmation: true }, AppError>>;
  // Verify the OTP code that was emailed after signUp. `name` is required to
  // create the user profile row on first activation.
  verifyOtp(email: string, token: string, name: string): Promise<Result<User, AppError>>;
  // Re-sends the signup OTP to the given email address.
  resendOtp(email: string): Promise<Result<void, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
  signInWithGoogle(): Promise<Result<User, AppError>>;
  signInWithApple(): Promise<Result<User, AppError>>;
  // Sends a password-reset OTP to the given email. Supabase returns ok
  // regardless of whether the address is registered (prevents enumeration).
  sendPasswordReset(email: string): Promise<Result<void, AppError>>;
  // Verifies the recovery OTP and sets a new password in one step. Signs
  // the user in on success.
  confirmPasswordReset(email: string, token: string, newPassword: string): Promise<Result<User, AppError>>;
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
  // Debug only: clears all local auth state and the profile cache without a
  // network call. Safe to call while the session is still being restored.
  debugSignOut(): Promise<void>;
}
