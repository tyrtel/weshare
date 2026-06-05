import { ServiceContainer } from './ServiceContainer';
import {
  TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO,
  AUTH, PAYMENT, SHARE, STRIPE, OPEN_BANKING, PAYMENT_REGISTRY, AUDIT_LOG, BANK_LIST, RECEIPT_PARSER, RECEIPT_STORAGE, TRIP_STORE,
} from './tokens';
import type { ITripRepository } from '../interfaces/ITripRepository';
import type { IMemberRepository } from '../interfaces/IMemberRepository';
import type { IExpenseRepository } from '../interfaces/IExpenseRepository';
import type { ISplitRepository } from '../interfaces/ISplitRepository';
import type { ISplitRequestRepository } from '../interfaces/ISplitRequestRepository';
import type { IAuthService } from '../interfaces/IAuthService';
import type { IPaymentService } from '../interfaces/IPaymentService';
import type { IShareService } from '../interfaces/IShareService';
import type { IStripeService } from '../interfaces/IStripeService';
import type { IOpenBankingService } from '../interfaces/IOpenBankingService';
import type { IPaymentMethodRegistry } from '../interfaces/IPaymentMethod';
import type { IAuditLogRepository } from '../interfaces/IAuditLogRepository';
import type { IBankListService } from '../interfaces/IBankListService';
import type { IReceiptParser } from '../interfaces/IReceiptParser';
import type { IReceiptStorage } from '../interfaces/IReceiptStorage';
import type { TripSessionStoreApi } from '../../store/tripSessionStore';

export interface ContainerOverrides {
  tripRepo?:         ITripRepository;
  memberRepo?:       IMemberRepository;
  expenseRepo?:      IExpenseRepository;
  splitRepo?:        ISplitRepository;
  splitRequestRepo?: ISplitRequestRepository;
  auth?:             IAuthService;
  payment?:          IPaymentService;
  share?:            IShareService;
  stripe?:           IStripeService;
  openBanking?:      IOpenBankingService;
  paymentRegistry?:  IPaymentMethodRegistry;
  auditLog?:         IAuditLogRepository;
  bankList?:         IBankListService;
  receiptParser?:    IReceiptParser;
  receiptStorage?:   IReceiptStorage;
  tripStore?:        TripSessionStoreApi;
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
 * @example (with seeded repo)
 * const tripRepo = new InMemoryTripRepository().seed([trip1, trip2]);
 * const container = createTestContainer({ tripRepo });
 */
export function createTestContainer(overrides: ContainerOverrides = {}): ServiceContainer {
  const { InMemoryTripRepository } = require('../../__mocks__/InMemoryTripRepository');
  const { InMemoryMemberRepository } = require('../../__mocks__/InMemoryMemberRepository');
  const { InMemoryExpenseRepository } = require('../../__mocks__/InMemoryExpenseRepository');
  const { InMemorySplitRepository } = require('../../__mocks__/InMemorySplitRepository');
  const { InMemorySplitRequestRepository } = require('../../__mocks__/InMemorySplitRequestRepository');
  const { MockAuthService } = require('../../__mocks__/MockAuthService');
  const { MockPaymentService } = require('../../__mocks__/MockPaymentService');
  const { MockShareService } = require('../../__mocks__/MockShareService');
  const { MockStripeService } = require('../../__mocks__/MockStripeService');
  const { MockOpenBankingService } = require('../../__mocks__/MockOpenBankingService');
  const { MockPaymentMethodRegistry } = require('../../__mocks__/MockPaymentMethodRegistry');
  const { InMemoryAuditLogRepository } = require('../../__mocks__/InMemoryAuditLogRepository');
  const { MockBankListService } = require('../../__mocks__/MockBankListService');
  const { MockReceiptParserService } = require('../../__mocks__/MockReceiptParserService');
  const { MockReceiptStorage } = require('../../__mocks__/MockReceiptStorage');
  const { createTripSessionStore } = require('../../store/tripSessionStore');

  const tripRepo   = overrides.tripRepo   ?? new InMemoryTripRepository();
  const memberRepo = overrides.memberRepo ?? new InMemoryMemberRepository();
  // Share the same splits Map so splitRepo.updateSplit() is visible to expenseRepo.getExpensesForTrip().
  const splitRepo  = overrides.splitRepo  ?? new InMemorySplitRepository();
  const expenseRepo = overrides.expenseRepo ?? new InMemoryExpenseRepository(
    overrides.splitRepo ? undefined : splitRepo.splits,
  );
  const splitRequestRepo = overrides.splitRequestRepo ?? new InMemorySplitRequestRepository();

  const container = new ServiceContainer();
  container.register(TRIP_REPO,          tripRepo);
  container.register(MEMBER_REPO,        memberRepo);
  container.register(EXPENSE_REPO,       expenseRepo);
  container.register(SPLIT_REPO,         splitRepo);
  container.register(SPLIT_REQUEST_REPO, splitRequestRepo);
  container.register(AUTH,             overrides.auth            ?? new MockAuthService());
  container.register(PAYMENT,          overrides.payment         ?? new MockPaymentService());
  container.register(SHARE,            overrides.share           ?? new MockShareService());
  container.register(STRIPE,           overrides.stripe          ?? new MockStripeService());
  container.register(OPEN_BANKING,     overrides.openBanking     ?? new MockOpenBankingService());
  container.register(PAYMENT_REGISTRY, overrides.paymentRegistry ?? new MockPaymentMethodRegistry());
  container.register(AUDIT_LOG,        overrides.auditLog        ?? new InMemoryAuditLogRepository());
  container.register(BANK_LIST,        overrides.bankList        ?? new MockBankListService());
  container.register(RECEIPT_PARSER,   overrides.receiptParser   ?? new MockReceiptParserService());
  container.register(RECEIPT_STORAGE,  overrides.receiptStorage  ?? new MockReceiptStorage());
  container.register(
    TRIP_STORE,
    overrides.tripStore ?? createTripSessionStore({ trips: tripRepo, expenses: expenseRepo, members: memberRepo, splits: splitRepo, splitRequests: splitRequestRepo }),
  );
  return container;
}
