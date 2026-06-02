import { ServiceContainer } from './ServiceContainer';
import {
  TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO,
  AUTH, PAYMENT, SHARE, STRIPE, OPEN_BANKING, PAYMENT_REGISTRY, RECEIPT_PARSER, RECEIPT_STORAGE, TRIP_STORE,
} from './tokens';
import { createTripSessionStore } from '../../store/tripSessionStore';
import type { PaymentProvider } from '../interfaces/IPaymentService';

/**
 * Builds the container used in production.
 * Uses dynamic imports so infrastructure code is loaded lazily and mock modules
 * are never bundled into the production app.
 */
export async function createProductionContainer(): Promise<ServiceContainer> {
  const { SupabaseTripRepository } = await import(
    '../../infrastructure/supabase/SupabaseTripRepository'
  );
  const { SupabaseMemberRepository } = await import(
    '../../infrastructure/supabase/SupabaseMemberRepository'
  );
  const { SupabaseExpenseRepository } = await import(
    '../../infrastructure/supabase/SupabaseExpenseRepository'
  );
  const { SupabaseSplitRepository } = await import(
    '../../infrastructure/supabase/SupabaseSplitRepository'
  );
  const { SupabaseSplitRequestRepository } = await import(
    '../../infrastructure/supabase/SupabaseSplitRequestRepository'
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
  const { StripeService } = await import(
    '../../infrastructure/services/StripeService'
  );
  const { OpenBankingService } = await import(
    '../../infrastructure/services/OpenBankingService'
  );
  const { DeepLinkPaymentMethod } = await import(
    '../../infrastructure/payment/DeepLinkPaymentMethod'
  );
  const { StripePaymentMethod } = await import(
    '../../infrastructure/payment/StripePaymentMethod'
  );
  const { OpenBankingPaymentMethod } = await import(
    '../../infrastructure/payment/OpenBankingPaymentMethod'
  );
  const { PaymentMethodRegistry } = await import(
    '../services/PaymentMethodRegistry'
  );
  const { ReceiptParserService } = await import(
    '../../infrastructure/services/ReceiptParserService'
  );
  const { SupabaseReceiptStorage } = await import(
    '../../infrastructure/supabase/SupabaseReceiptStorage'
  );

  const tripRepo         = new SupabaseTripRepository();
  const memberRepo       = new SupabaseMemberRepository();
  const expenseRepo      = new SupabaseExpenseRepository();
  const splitRepo        = new SupabaseSplitRepository();
  const splitRequestRepo = new SupabaseSplitRequestRepository();

  const paymentService = new DeepLinkPaymentService();
  const stripeService  = new StripeService();

  const DEEP_LINK_PROVIDERS: PaymentProvider[] = ['revolut', 'venmo', 'lydia', 'paypal', 'other'];
  const registry = new PaymentMethodRegistry([
    ...DEEP_LINK_PROVIDERS.map(p => new DeepLinkPaymentMethod(p, paymentService)),
    new StripePaymentMethod(stripeService),
    new OpenBankingPaymentMethod(),
  ]);

  const container = new ServiceContainer();
  container.register(TRIP_REPO,          tripRepo);
  container.register(MEMBER_REPO,        memberRepo);
  container.register(EXPENSE_REPO,       expenseRepo);
  container.register(SPLIT_REPO,         splitRepo);
  container.register(SPLIT_REQUEST_REPO, splitRequestRepo);
  container.register(AUTH,             new SupabaseAuthService());
  container.register(PAYMENT,          paymentService);
  container.register(SHARE,            new NativeShareService());
  container.register(STRIPE,           stripeService);
  container.register(OPEN_BANKING,     new OpenBankingService());
  container.register(PAYMENT_REGISTRY, registry);
  container.register(RECEIPT_PARSER,   new ReceiptParserService());
  container.register(RECEIPT_STORAGE,  new SupabaseReceiptStorage());
  container.register(TRIP_STORE,       createTripSessionStore({ trips: tripRepo, expenses: expenseRepo, members: memberRepo, splits: splitRepo, splitRequests: splitRequestRepo }));
  return container;
}
