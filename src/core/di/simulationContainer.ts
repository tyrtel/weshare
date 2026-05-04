/**
 * Creates a ServiceContainer pre-loaded with simulation fixture data and a
 * signed-in guest user (Jay).  Used exclusively when EXPO_PUBLIC_SIMULATE=true.
 *
 * Distinct from createTestContainer() which is stateless/blank — simulation
 * mode needs rich seed data so every screen is explorable without a real
 * Supabase project.
 */

import { ServiceContainer } from './ServiceContainer';
import { STORAGE, AUTH, PAYMENT, SHARE, TRIP_STORE } from './tokens';
import { createTripSessionStore } from '../../store/tripSessionStore';
import { InMemoryStorageService } from '../../__mocks__/InMemoryStorageService';
import { MockAuthService } from '../../__mocks__/MockAuthService';
import { MockPaymentService } from '../../__mocks__/MockPaymentService';
import { MockShareService } from '../../__mocks__/MockShareService';
import { restaurantScenario, RESTAURANT_CURRENT_USER } from '../../__mocks__/fixtures/restaurantScenario';
import { twoPersonScenario } from '../../__mocks__/fixtures/twoPersonScenario';
import type { StorageFixtures } from '../../__mocks__/InMemoryStorageService';

function mergeFixtures(...scenarios: StorageFixtures[]): StorageFixtures {
  return {
    trips:    scenarios.flatMap(s => s.trips    ?? []),
    members:  scenarios.flatMap(s => s.members  ?? []),
    expenses: scenarios.flatMap(s => s.expenses ?? []),
    splits:   scenarios.flatMap(s => s.splits   ?? []),
  };
}

export async function createSimulationContainer(): Promise<ServiceContainer> {
  console.log('[simulationContainer] start');
  const storage = new InMemoryStorageService();
  storage.seed(mergeFixtures(restaurantScenario, twoPersonScenario));
  console.log('[simulationContainer] storage seeded');

  const auth = new MockAuthService();
  console.log('[simulationContainer] signing in as', RESTAURANT_CURRENT_USER);
  // Pre-sign-in so TripListScreen loads immediately without prompting the user.
  await auth.signInAsGuest(RESTAURANT_CURRENT_USER);
  console.log('[simulationContainer] signed in');

  const container = new ServiceContainer();
  container.register(STORAGE,     storage);
  container.register(AUTH,        auth);
  container.register(PAYMENT,     new MockPaymentService());
  container.register(SHARE,       new MockShareService());
  container.register(TRIP_STORE,  createTripSessionStore(storage));
  return container;
}
