/**
 * Creates a ServiceContainer pre-loaded with simulation fixture data and a
 * signed-in guest user (Jay).  Used exclusively when EXPO_PUBLIC_SIMULATE=true.
 *
 * Distinct from createTestContainer() which is stateless/blank — simulation
 * mode needs rich seed data so every screen is explorable without a real
 * Supabase project.
 */

import Constants from 'expo-constants';
import { ServiceContainer } from './ServiceContainer';
import {
  TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO,
  AUTH, PAYMENT, SHARE, STRIPE, OPEN_BANKING, PAYMENT_REGISTRY, AUDIT_LOG, BANK_LIST, RECEIPT_PARSER, RECEIPT_STORAGE, TRIP_STORE,
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

import { restaurantScenario, RESTAURANT_CURRENT_USER } from '../../__mocks__/fixtures/restaurantScenario';
import { twoPersonScenario } from '../../__mocks__/fixtures/twoPersonScenario';
import { settlingScenario } from '../../__mocks__/fixtures/settlingScenario';
import type { StorageFixtures } from '../../__mocks__/fixtures/types';
import { logger } from '../utils/logger';

const USE_LIVE_OCR =
  Constants.expoConfig?.extra?.ocrLive === true ||
  process.env.EXPO_PUBLIC_OCR_LIVE === 'true';

function mergeFixtures(...scenarios: StorageFixtures[]): StorageFixtures {
  return {
    trips:         scenarios.flatMap(s => s.trips         ?? []),
    members:       scenarios.flatMap(s => s.members       ?? []),
    expenses:      scenarios.flatMap(s => s.expenses      ?? []),
    splits:        scenarios.flatMap(s => s.splits        ?? []),
    splitRequests: scenarios.flatMap(s => s.splitRequests ?? []),
  };
}

function assertLiveOcrConfig(): void {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const url   = (extra?.supabaseUrl   as string | undefined) ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key   = (extra?.supabaseAnonKey as string | undefined) ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const errors: string[] = [];

  if (!url || url.includes('placeholder')) {
    errors.push('EXPO_PUBLIC_SUPABASE_URL is missing or still set to the placeholder value');
  } else if (url.includes('/rest/v1') || url.endsWith('/')) {
    errors.push(`EXPO_PUBLIC_SUPABASE_URL should be the bare project URL (e.g. https://xxx.supabase.co), got: ${url}`);
  }
  if (!key || key.includes('placeholder')) {
    errors.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or still set to the placeholder value');
  }

  if (errors.length > 0) {
    throw new Error(
      `[simulate:ocr] Cannot start with EXPO_PUBLIC_OCR_LIVE=true:\n` +
      errors.map(e => `  • ${e}`).join('\n') +
      `\n  Fix these in .env.local then restart.`,
    );
  }
}

export async function createSimulationContainer(): Promise<ServiceContainer> {
  if (USE_LIVE_OCR) assertLiveOcrConfig();
  logger.log('[simulationContainer] OCR mode:', USE_LIVE_OCR ? 'LIVE (Supabase Edge Function)' : 'mock');
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
  await auth.signInAsGuest(RESTAURANT_CURRENT_USER);
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
  if (USE_LIVE_OCR) {
    // The live ReceiptParserService calls supabase.functions.invoke, which
    // requires a real Supabase JWT (anon key alone has no `sub` claim).
    // Sign in anonymously so the Supabase client holds a valid user session.
    const { supabase } = await import('../../infrastructure/supabase/supabaseClient');
    const { error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) {
      logger.warn('[simulationContainer] anonymous sign-in failed — falling back to mock OCR:', anonError.message);
      container.register(RECEIPT_PARSER, new MockReceiptParserService());
    } else {
      logger.log('[simulationContainer] anonymous Supabase session ready for live OCR');
      const { ReceiptParserService } = await import('../../infrastructure/services/ReceiptParserService');
      container.register(RECEIPT_PARSER, new ReceiptParserService());
    }
  } else {
    container.register(RECEIPT_PARSER, new MockReceiptParserService());
  }
  container.register(RECEIPT_STORAGE,  new MockReceiptStorage());
  container.register(TRIP_STORE,   createTripSessionStore({ trips: tripRepo, expenses: expenseRepo, members: memberRepo, splits: splitRepo, splitRequests: splitRequestRepo }));
  return container;
}
