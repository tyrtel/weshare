import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { ISplitRequestRepository } from '../core/interfaces/ISplitRequestRepository';
import type { SplitRequest } from '../core/models/SplitRequest';

export class InMemorySplitRequestRepository implements ISplitRequestRepository {
  private readonly splitRequests = new Map<string, SplitRequest>();

  seed(splitRequests: SplitRequest[]): this {
    splitRequests.forEach(r => this.splitRequests.set(r.id, r));
    return this;
  }

  getSplitRequest = async (id: string): Promise<Result<SplitRequest, AppError>> => {
    const req = this.splitRequests.get(id);
    if (!req) return err({ kind: 'NotFoundError', resource: 'SplitRequest', id });
    return ok(req);
  };

  getSplitRequestsForTrip = async (tripId: string): Promise<Result<SplitRequest[], AppError>> => {
    const result: SplitRequest[] = [];
    for (const req of this.splitRequests.values()) {
      if (req.tripId === tripId) result.push(req);
    }
    return ok(result);
  };

  saveSplitRequest = async (req: SplitRequest): Promise<Result<SplitRequest, AppError>> => {
    this.splitRequests.set(req.id, req);
    return ok(req);
  };

  updateSplitRequest = async (req: SplitRequest): Promise<Result<SplitRequest, AppError>> => {
    if (!this.splitRequests.has(req.id)) {
      return err({ kind: 'NotFoundError', resource: 'SplitRequest', id: req.id });
    }
    this.splitRequests.set(req.id, req);
    return ok(req);
  };
}
