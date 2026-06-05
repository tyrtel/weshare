import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { User } from '../models/User';

export type AuthStateListener = (user: User | null) => void;
export type Unsubscribe = () => void;

export interface IAuthService {
  signIn(email: string, password: string): Promise<Result<User, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
  // Guest path: creates an anonymous session with a display name.
  signInAsGuest(name: string): Promise<Result<User, AppError>>;
  // Social sign-in via Google (Android + iOS).
  signInWithGoogle(): Promise<Result<User, AppError>>;
  // Social sign-in via Apple (iOS only; unavailable on Android).
  signInWithApple(): Promise<Result<User, AppError>>;
  // After a social sign-in, re-parents any TripMember / expense records
  // that were created under the given guest user ID to the now-authenticated user.
  recoverGuestSession(guestUserId: string): Promise<Result<void, AppError>>;
  // Returns the currently authenticated user synchronously, or null.
  currentUser(): User | null;
  // Resolves once the initial session has been restored from storage.
  // Use this in the auth gate to avoid flashing /auth on relaunch.
  getInitialUser(): Promise<User | null>;
  // Subscribe to auth state changes. Returns an unsubscribe function.
  onAuthStateChange(listener: AuthStateListener): Unsubscribe;
}
