import { ok } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IShareService } from '../core/interfaces/IShareService';

export interface ShareTripCall {
  tripId: string;
  tripName: string;
}

export class MockShareService implements IShareService {
  readonly calls: ShareTripCall[] = [];

  async shareTrip(tripId: string, tripName: string): Promise<Result<void, AppError>> {
    this.calls.push({ tripId, tripName });
    return ok(undefined);
  }
}
