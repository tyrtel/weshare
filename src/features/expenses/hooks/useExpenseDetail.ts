import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Expense } from '../../../core/models/Expense';
import type { AppError } from '../../../core/types/AppError';

interface UseExpenseDetailState {
  expense: Expense | null;
  loading: boolean;
  error: AppError | null;
}

export function useExpenseDetail(expenseId: string) {
  const expenseRepo = useService(EXPENSE_REPO);

  const [state, setState] = useState<UseExpenseDetailState>({
    expense: null,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const result = await expenseRepo.getExpense(expenseId);
    if (isOk(result)) {
      setState({ expense: result.value, loading: false, error: null });
    } else {
      setState({ expense: null, loading: false, error: result.error });
    }
  }, [expenseRepo, expenseId]);

  useFocusEffect(
    useCallback(() => { load(); }, [load]),
  );

  return { ...state, refetch: load };
}
