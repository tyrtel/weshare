import { useState, useEffect, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import type { AppError } from '../../../core/types/AppError';

export function useAuditHistory(tripId: string, fromUserId: string, toUserId: string) {
  const repo = useService(SPLIT_REQUEST_REPO);

  const [requests, setRequests] = useState<SplitRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<AppError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await repo.getSplitRequestsForTrip(tripId);
    if (!isOk(result)) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const filtered = result.value
      .filter(r => r.payerUserId === fromUserId && r.requesterUserId === toUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    setRequests(filtered);
    setLoading(false);
  }, [tripId, fromUserId, toUserId, repo]);

  useEffect(() => { void load(); }, [load]);

  return { requests, loading, error, refetch: load };
}
