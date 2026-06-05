import { ok } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IBankListService, Bank } from '../core/interfaces/IBankListService';

const MOCK_BANKS: Bank[] = [
  { id: 'mock_bnp',      name: 'BNP Paribas',   logoUrl: null },
  { id: 'mock_sg',       name: 'Société Générale', logoUrl: null },
  { id: 'mock_ca',       name: 'Crédit Agricole', logoUrl: null },
  { id: 'mock_hsbc',     name: 'HSBC',            logoUrl: null },
  { id: 'mock_revolut',  name: 'Revolut',          logoUrl: null },
];

export class MockBankListService implements IBankListService {
  getBanks = async (_market: string): Promise<Result<Bank[], AppError>> => ok(MOCK_BANKS);
}
