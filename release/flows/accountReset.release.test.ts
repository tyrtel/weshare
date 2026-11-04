import { createClient } from '@supabase/supabase-js';
import { useCreateTrip } from '../../src/features/trips/hooks/useCreateTrip';
import { supabase, supabaseUrl } from '../../src/infrastructure/supabase/supabaseClient';
import { admin, closeClient, createUser, renderAppHook, run, TestUser } from '../support';

async function tripCount(userId: string): Promise<number> {
  const { count } = await admin.from('trips').select('id', { count: 'exact', head: true }).eq('owner_id', userId);
  return count ?? 0;
}

// Unused by the app today, but callable through the API. Before 050 every call
// failed on a text = uuid comparison, which was all that stopped an anonymous
// caller from deleting any user's trips.
describe('reset_user_data', () => {
  let victim: TestUser;

  beforeAll(async () => {
    victim = await createUser('Victim');
    const { result } = await renderAppHook(() => useCreateTrip());
    await run(() => result.current.createTrip('Keep me', 'EUR'));
    expect(await tripCount(victim.id)).toBe(1);
  });

  afterAll(closeClient);

  it("an anonymous caller cannot wipe another user's data", async () => {
    const anon = createClient(supabaseUrl, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc('reset_user_data', { p_user_id: victim.id });
    expect(error?.message).toMatch(/permission denied/i);
    expect(await tripCount(victim.id)).toBe(1);
  });

  it('a signed-in user can reset their own data', async () => {
    const { error } = await supabase.rpc('reset_user_data', { p_user_id: victim.id });
    expect(error).toBeNull();
    expect(await tripCount(victim.id)).toBe(0);
  });
});
