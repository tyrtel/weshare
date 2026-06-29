/**
 * Creates a ServiceContainer pre-loaded with simulation fixture data and a
 * signed-in guest user (Jay).  Used exclusively when EXPO_PUBLIC_SIMULATE=true.
 *
 * Distinct from createTestContainer() which is stateless/blank — simulation
 * mode needs rich seed data so every screen is explorable without a real
 * Supabase project.
 */

import { ServiceContainer } from './ServiceContainer';
import {
  TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO,
  AUTH, PAYMENT, SHARE, STRIPE, OPEN_BANKING, PAYMENT_REGISTRY, AUDIT_LOG, BANK_LIST, RECEIPT_PARSER, RECEIPT_STORAGE, EXCHANGE_RATE, TRIP_STORE, GROUP_REPO,
} from './tokens';
import { createTripSessionStore } from '../../store/tripSessionStore';
import { InMemoryTripRepository } from '../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../__mocks__/InMemorySplitRepository';
import { InMemorySplitRequestRepository } from '../../__mocks__/InMemorySplitRequestRepository';
import { MockAuthService } from '../../__mocks__/MockAuthService';
import { MockPaymentService } from '../../__mocks__/MockPaymentService';
import { MockShareService } from '../../__mocks__/MockShareService';
import { MockStripeService } from '../../__mocks__/MockStripeService';
import { MockOpenBankingService } from '../../__mocks__/MockOpenBankingService';
import { MockPaymentMethodRegistry } from '../../__mocks__/MockPaymentMethodRegistry';
import { InMemoryAuditLogRepository } from '../../__mocks__/InMemoryAuditLogRepository';
import { MockBankListService } from '../../__mocks__/MockBankListService';
import { MockReceiptParserService } from '../../__mocks__/MockReceiptParserService';
import { MockReceiptStorage } from '../../__mocks__/MockReceiptStorage';
import { MockExchangeRateService } from '../../__mocks__/MockExchangeRateService';
import { InMemoryGroupRepository } from '../../__mocks__/InMemoryGroupRepository';

import { restaurantScenario, RESTAURANT_CURRENT_USER, RESTAURANT_CURRENT_USER_EMAIL } from '../../__mocks__/fixtures/restaurantScenario';
import { twoPersonScenario } from '../../__mocks__/fixtures/twoPersonScenario';
import { settlingScenario } from '../../__mocks__/fixtures/settlingScenario';
import type { StorageFixtures } from '../../__mocks__/fixtures/types';
import { logger } from '../utils/logger';

function mergeFixtures(...scenarios: StorageFixtures[]): StorageFixtures {
  return {
    trips:         scenarios.flatMap(s => s.trips         ?? []),
    members:       scenarios.flatMap(s => s.members       ?? []),
    expenses:      scenarios.flatMap(s => s.expenses      ?? []),
    splits:        scenarios.flatMap(s => s.splits        ?? []),
    splitRequests: scenarios.flatMap(s => s.splitRequests ?? []),
  };
}

let _singleton: Promise<ServiceContainer> | undefined;

export function createSimulationContainer(): Promise<ServiceContainer> {
  if (!_singleton) {
    _singleton = _create().catch(e => {
      _singleton = undefined;
      throw e;
    });
  }
  return _singleton;
}

async function _create(): Promise<ServiceContainer> {
  logger.log('[simulationContainer] start');
  const merged = mergeFixtures(restaurantScenario, twoPersonScenario, settlingScenario);

  const tripRepo   = new InMemoryTripRepository().seed(merged.trips ?? []);
  const memberRepo = new InMemoryMemberRepository().seed(merged.members ?? []);
  // Share the splits Map so splitRepo.updateSplit() is visible to expenseRepo.getExpensesForTrip().
  const splitRepo  = new InMemorySplitRepository().seed(merged.splits ?? []);
  const expenseRepo = new InMemoryExpenseRepository(splitRepo.splits).seed(merged.expenses ?? [], merged.splits ?? []);
  const splitRequestRepo = new InMemorySplitRequestRepository().seed(merged.splitRequests ?? []);
  logger.log('[simulationContainer] repos seeded');

  const auth = new MockAuthService();
  logger.log('[simulationContainer] signing in as', RESTAURANT_CURRENT_USER);
  await auth.signIn(RESTAURANT_CURRENT_USER_EMAIL, 'password');
  logger.log('[simulationContainer] signed in');

  const container = new ServiceContainer();
  container.register(TRIP_REPO,          tripRepo);
  container.register(MEMBER_REPO,        memberRepo);
  container.register(EXPENSE_REPO,       expenseRepo);
  container.register(SPLIT_REPO,         splitRepo);
  container.register(SPLIT_REQUEST_REPO, splitRequestRepo);
  container.register(AUTH,         auth);
  container.register(PAYMENT,          new MockPaymentService());
  container.register(SHARE,            new MockShareService());
  container.register(STRIPE,           new MockStripeService());
  container.register(OPEN_BANKING,     new MockOpenBankingService());
  container.register(PAYMENT_REGISTRY, new MockPaymentMethodRegistry());
  container.register(AUDIT_LOG,        new InMemoryAuditLogRepository());
  container.register(BANK_LIST,        new MockBankListService());
  container.register(RECEIPT_PARSER, new MockReceiptParserService());
  container.register(RECEIPT_STORAGE,  new MockReceiptStorage());
  container.register(EXCHANGE_RATE,    new MockExchangeRateService());
  const groupRepo = new InMemoryGroupRepository();
  container.register(GROUP_REPO,   groupRepo);
  container.register(TRIP_STORE,   createTripSessionStore({ trips: tripRepo, expenses: expenseRepo, members: memberRepo, splits: splitRepo, splitRequests: splitRequestRepo, groups: groupRepo }));
  return container;
}
