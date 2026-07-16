import { ServiceContainer } from './ServiceContainer';
import {
  TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO,
  AUTH, PAYMENT, SHARE, STRIPE, OPEN_BANKING, PAYMENT_REGISTRY, AUDIT_LOG, BANK_LIST, RECEIPT_PARSER, RECEIPT_STORAGE, EXCHANGE_RATE, TRIP_STORE, GROUP_REPO, RECURRING_EXPENSE_REPO, NOTIFICATION_SERVICE, REPORT_SERVICE,
} from './tokens';
import { createTripSessionStore } from '../../store/tripSessionStore';
import type { PaymentProvider } from '../interfaces/IPaymentService';

// Module-level singleton: prevents the factory from running more than once even
// when Expo Router renders the root layout twice (concurrent hydration) or when
// Metro evaluates this file from two differently-resolved paths.
let _singleton: Promise<ServiceContainer> | undefined;

export function createProductionContainer(): Promise<ServiceContainer> {
  if (!_singleton) {
    _singleton = _create().catch(e => {
      _singleton = undefined; // allow retry if the factory rejects
      throw e;
    });
  }
  return _singleton;
}

async function _create(): Promise<ServiceContainer> {
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
  const { getAuthService } = await import(
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
  const { SupabaseAuditLogRepository } = await import(
    '../../infrastructure/supabase/SupabaseAuditLogRepository'
  );
  const { TinkBankListService } = await import(
    '../../infrastructure/services/TinkBankListService'
  );
  const { ExchangeRateService } = await import(
    '../../infrastructure/exchange-rate/ExchangeRateService'
  );
  const { SupabaseGroupRepository } = await import(
    '../../infrastructure/supabase/SupabaseGroupRepository'
  );
  const { SupabaseRecurringExpenseRepository } = await import(
    '../../infrastructure/supabase/SupabaseRecurringExpenseRepository'
  );
  const { SupabaseNotificationService } = await import(
    '../../infrastructure/supabase/SupabaseNotificationService'
  );
  const { SupabaseReportService } = await import(
    '../../infrastructure/supabase/SupabaseReportService'
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
  container.register(AUTH,             getAuthService());
  container.register(PAYMENT,          paymentService);
  container.register(SHARE,            new NativeShareService());
  container.register(STRIPE,           stripeService);
  container.register(OPEN_BANKING,     new OpenBankingService());
  container.register(PAYMENT_REGISTRY, registry);
  container.register(AUDIT_LOG,        new SupabaseAuditLogRepository());
  container.register(BANK_LIST,        new TinkBankListService());
  container.register(RECEIPT_PARSER,   new ReceiptParserService());
  container.register(RECEIPT_STORAGE,  new SupabaseReceiptStorage());
  container.register(EXCHANGE_RATE,    new ExchangeRateService());
  const groupRepo = new SupabaseGroupRepository();
  container.register(GROUP_REPO,              groupRepo);
  container.register(RECURRING_EXPENSE_REPO,  new SupabaseRecurringExpenseRepository());
  container.register(NOTIFICATION_SERVICE,    new SupabaseNotificationService());
  container.register(REPORT_SERVICE,          new SupabaseReportService());
  container.register(TRIP_STORE,              createTripSessionStore({ trips: tripRepo, expenses: expenseRepo, members: memberRepo, splits: splitRepo, splitRequests: splitRequestRepo, groups: groupRepo }));
  return container;
}
