import type { IStorageService } from '../interfaces/IStorageService';
import type { IPaymentService } from '../interfaces/IPaymentService';
import type { INotificationService } from '../interfaces/INotificationService';

// ── Service registry type ─────────────────────────────────────────────────────

export type ServiceKey = 'storageService' | 'paymentService' | 'notificationService';

type ServiceMap = {
  storageService: IStorageService;
  paymentService: IPaymentService;
  notificationService: INotificationService;
};

// ── Container ─────────────────────────────────────────────────────────────────

export class ServiceContainer {
  private readonly services = new Map<ServiceKey, unknown>();

  register<K extends ServiceKey>(key: K, service: ServiceMap[K]): void {
    this.services.set(key, service);
  }

  resolve<K extends ServiceKey>(key: K): ServiceMap[K] {
    const service = this.services.get(key);
    if (service === undefined) {
      throw new Error(`Service "${key}" is not registered in the container.`);
    }
    return service as ServiceMap[K];
  }

  has(key: ServiceKey): boolean {
    return this.services.has(key);
  }
}

// ── Production factory ────────────────────────────────────────────────────────

/**
 * Builds the container used in production. Uses dynamic imports so that
 * infrastructure code is loaded lazily and mock modules are never bundled
 * in the production app.
 */
export async function createProductionContainer(): Promise<ServiceContainer> {
  const { SqliteStorageService } = await import(
    '../../infrastructure/storage/SqliteStorageService'
  );
  const { VenmoPaymentService } = await import(
    '../../infrastructure/payments/VenmoPaymentService'
  );
  const { StubNotificationService } = await import(
    '../../infrastructure/notifications/StubNotificationService'
  );

  const container = new ServiceContainer();
  container.register('storageService', new SqliteStorageService());
  container.register('paymentService', new VenmoPaymentService());
  container.register('notificationService', new StubNotificationService());
  return container;
}

// ── Test factory ──────────────────────────────────────────────────────────────

/**
 * Builds a container wired with in-memory mocks — no I/O, no native modules.
 * Import and call this in every test's `beforeEach`.
 *
 * @example
 * const container = createTestContainer();
 * const storage = container.resolve('storageService') as InMemoryStorageService;
 */
export function createTestContainer(): ServiceContainer {
  // require() keeps these imports out of the module graph when the production
  // bundle is analysed, while still allowing TypeScript to compile the file.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { InMemoryStorageService } = require('../../__mocks__/InMemoryStorageService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MockPaymentService } = require('../../__mocks__/MockPaymentService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MockNotificationService } = require('../../__mocks__/MockNotificationService');

  const container = new ServiceContainer();
  container.register('storageService', new InMemoryStorageService());
  container.register('paymentService', new MockPaymentService());
  container.register('notificationService', new MockNotificationService());
  return container;
}
