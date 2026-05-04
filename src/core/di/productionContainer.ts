import { ServiceContainer } from './ServiceContainer';
import { STORAGE, AUTH, PAYMENT, SHARE, TRIP_STORE } from './tokens';
import { createTripSessionStore } from '../../store/tripSessionStore';

/**
 * Builds the container used in production.
 * Uses dynamic imports so infrastructure code is loaded lazily and mock modules
 * are never bundled into the production app.
 */
export async function createProductionContainer(): Promise<ServiceContainer> {
  const { SupabaseStorageService } = await import(
    '../../infrastructure/supabase/SupabaseStorageService'
  );
  const { SupabaseAuthService } = await import(
    '../../infrastructure/supabase/SupabaseAuthService'
  );
  const { DeepLinkPaymentService } = await import(
    '../../infrastructure/services/DeepLinkPaymentService'
  );
  const { NativeShareService } = await import(
    '../../infrastructure/services/NativeShareService'
  );

  const container = new ServiceContainer();
  // storageService shared between STORAGE and TRIP_STORE so the store reads
  // from the same Supabase client that the rest of the app writes through.
  const storageService = new SupabaseStorageService();
  container.register(STORAGE, storageService);
  container.register(AUTH, new SupabaseAuthService());
  container.register(PAYMENT, new DeepLinkPaymentService());
  container.register(SHARE, new NativeShareService());
  container.register(TRIP_STORE, createTripSessionStore(storageService));
  return container;
}
