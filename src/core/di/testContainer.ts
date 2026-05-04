import { ServiceContainer } from './ServiceContainer';
import { STORAGE, AUTH, PAYMENT, SHARE, TRIP_STORE } from './tokens';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IAuthService } from '../interfaces/IAuthService';
import type { IPaymentService } from '../interfaces/IPaymentService';
import type { IShareService } from '../interfaces/IShareService';
import type { TripSessionStoreApi } from '../../store/tripSessionStore';

export interface ContainerOverrides {
  storage?: IStorageService;
  auth?: IAuthService;
  payment?: IPaymentService;
  share?: IShareService;
  tripStore?: TripSessionStoreApi;
}

/**
 * Creates a ServiceContainer wired with in-memory mocks.
 * Call this in every test's `beforeEach` — each call gives a fresh container
 * with clean state so tests never share mutable service instances.
 *
 * @example
 * let container: ServiceContainer;
 * beforeEach(() => {
 *   container = createTestContainer();
 * });
 *
 * @example (with override)
 * const myStorage = new InMemoryStorageService();
 * myStorage.seed(restaurantScenario);
 * const container = createTestContainer({ storage: myStorage });
 */
export function createTestContainer(overrides: ContainerOverrides = {}): ServiceContainer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { InMemoryStorageService } = require('../../__mocks__/InMemoryStorageService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MockAuthService } = require('../../__mocks__/MockAuthService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MockPaymentService } = require('../../__mocks__/MockPaymentService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MockShareService } = require('../../__mocks__/MockShareService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createTripSessionStore } = require('../../store/tripSessionStore');

  const container = new ServiceContainer();
  // Use the same storage instance for both STORAGE and TRIP_STORE so tests
  // can seed data and have the store see it via a single InMemoryStorageService.
  const storage = overrides.storage ?? new InMemoryStorageService();
  container.register(STORAGE, storage);
  container.register(AUTH, overrides.auth ?? new MockAuthService());
  container.register(PAYMENT, overrides.payment ?? new MockPaymentService());
  container.register(SHARE, overrides.share ?? new MockShareService());
  container.register(TRIP_STORE, overrides.tripStore ?? createTripSessionStore(storage));
  return container;
}
