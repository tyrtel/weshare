import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from '../src/infrastructure/supabase/supabaseClient';
import { createProductionContainer } from '../src/core/di/productionContainer';
import { ServiceContext } from '../src/core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../src/core/di/tokens';
import { generateId } from '../src/core/utils/generateId';
import type { ServiceContainer } from '../src/core/di/ServiceContainer';

// loadEnv.js guards the env var; this guards the client the app code actually
// uses, in case a build step inlined a different URL.
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) {
  throw new Error(`[release] App Supabase client points at ${supabaseUrl}, not the local stack`);
}

// Service-role client for setup and for asserting on rows regardless of RLS.
export const admin = createClient(supabaseUrl, process.env.RELEASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface TestUser {
  id: string;
  name: string;
  email: string;
  password: string;
}

const PASSWORD = 'release-test-password';

export function uniqueEmail(name: string): string {
  return `${name.toLowerCase()}-${generateId().slice(0, 8)}@release.test`;
}

let started: Promise<ServiceContainer> | undefined;

// Builds the production container and runs the auth startup AuthGate runs on
// launch; hooks such as useCreateTrip wait on auth.awaitReady().
export function container(): Promise<ServiceContainer> {
  started ??= createProductionContainer().then(async c => {
    await c.resolve(AUTH).getInitialUser();
    return c;
  });
  return started;
}

// Signs up through the app's own auth service, so the users row is created the
// way the app creates it. Leaves the new user signed in.
export async function createUser(name: string, opts: { fullAccess?: boolean; email?: string } = {}): Promise<TestUser> {
  const c = await container();
  const auth = c.resolve(AUTH);
  await auth.signOut();
  c.resolve(TRIP_STORE).getState().resetSession();

  const email = opts.email ?? uniqueEmail(name);
  const result = await auth.signUp(email, PASSWORD, name);
  if (!result.ok) throw new Error(`[release] signUp failed for ${name}: ${result.error.message}`);
  if ('needsEmailConfirmation' in result.value) throw new Error('[release] Local auth requires email confirmation');

  if (opts.fullAccess) {
    const { error } = await admin.from('users').update({ full_access_override: true }).eq('id', result.value.id);
    if (error) throw new Error(`[release] grant full access failed: ${error.message}`);
  }
  return { id: result.value.id, name, email, password: PASSWORD };
}

// Switches the app's single Supabase session to `user`, clearing the store the
// way signing out does on a device.
export async function signInAs(user: TestUser): Promise<void> {
  const c = await container();
  const auth = c.resolve(AUTH);
  await auth.signOut();
  c.resolve(TRIP_STORE).getState().resetSession();
  const result = await auth.signIn(user.email, user.password);
  if (!result.ok) throw new Error(`[release] signIn failed for ${user.name}: ${result.error.message}`);
}

// Renders a hook inside the production container, the same wiring the app uses.
export async function renderAppHook<T>(hook: () => T) {
  const c = await container();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(ServiceContext.Provider, { value: c }, children);
  return renderHook(hook, { wrapper });
}

// Runs a hook action and returns its result, flushing React state updates.
export async function run<R>(action: () => Promise<R>): Promise<R> {
  let value!: R;
  await act(async () => { value = await action(); });
  return value;
}

// Stops the Supabase client's timers and sockets so Jest can exit.
export async function closeClient(): Promise<void> {
  await supabase.auth.stopAutoRefresh();
  await supabase.removeAllChannels();
}
