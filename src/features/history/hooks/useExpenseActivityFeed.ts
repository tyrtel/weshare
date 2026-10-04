import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useService } from '../../../core/di/ServiceContext';
import { ACTIVITY_LOG } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { ActivityEvent } from '../../../core/models/ActivityEvent';
import type { AppError } from '../../../core/types/AppError';

export function useExpenseActivityFeed(expenseId: string) {
  const activityLog = useService(ACTIVITY_LOG);
  const [events, setEvents]   = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<AppError | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    activityLog.getEventsForExpense(expenseId).then(result => {
      if (isOk(result)) setEvents(result.value);
      else setError(result.error);
      setLoading(false);
    });
  }, [activityLog, expenseId]);

  useFocusEffect(
    useCallback(() => { load(); }, [load]),
  );

  return { events, loading, error };
}
