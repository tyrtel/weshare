import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { SplitRequest } from '../models/SplitRequest';

export interface ISplitRequestRepository {
  getSplitRequest(id: string): Promise<Result<SplitRequest, AppError>>;
  getSplitRequestsForTrip(tripId: string): Promise<Result<SplitRequest[], AppError>>;
  saveSplitRequest(req: SplitRequest): Promise<Result<SplitRequest, AppError>>;
  updateSplitRequest(req: SplitRequest): Promise<Result<SplitRequest, AppError>>;
}
