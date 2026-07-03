import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, SPLIT_REPO, RECURRING_EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { generateId } from '../../../core/utils/generateId';
import type { RecurringExpense, RecurrencePeriod } from '../../../core/models/RecurringExpense';
import type { AppError } from '../../../core/types/AppError';

export interface CreateRecurringExpenseInput {
  description:       string;
  totalAmountCents:  number;
  currency:          string;
  paidByUserId:      string;
  period:            RecurrencePeriod;
  startDate:         Date;
  createdByUserId:   string;
  splits:            Array<{ userId: string; amountOwedCents: number }>;
  /** When promoting an already-existing expense to a recurring template, pass true to
   *  skip creating the redundant first-occurrence expense. */
  skipFirstExpense?: boolean;
}

const VALID_PERIODS: RecurrencePeriod[] = ['weekly', 'biweekly', 'monthly', 'quarterly'];

function addPeriod(date: Date, period: RecurrencePeriod): Date {
  const d = new Date(date);
  switch (period) {
    case 'weekly':    d.setDate(d.getDate() + 7);   break;
    case 'biweekly':  d.setDate(d.getDate() + 14);  break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
  }
  return d;
}

function todayMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function validate(input: CreateRecurringExpenseInput): AppError | null {
  if (!input.description.trim()) {
    return { kind: 'ValidationError', field: 'description', message: 'Description is required.' };
  }
  if (!Number.isInteger(input.totalAmountCents) || input.totalAmountCents <= 0) {
    return { kind: 'ValidationError', field: 'totalAmount', message: 'Amount must be a positive integer number of cents.' };
  }
  if (!input.paidByUserId) {
    return { kind: 'ValidationError', field: 'paidByUserId', message: 'Payer is required.' };
  }
  if (!VALID_PERIODS.includes(input.period)) {
    return { kind: 'ValidationError', field: 'period', message: 'Period must be weekly, biweekly, monthly, or quarterly.' };
  }
  if (input.splits.length === 0) {
    return { kind: 'ValidationError', field: 'splits', message: 'At least one person must share the expense.' };
  }
  const splitTotal = input.splits.reduce((s, sp) => s + sp.amountOwedCents, 0);
  if (splitTotal !== input.totalAmountCents) {
    return { kind: 'ValidationError', field: 'splits', message: `Split total (${splitTotal}¢) must equal expense total (${input.totalAmountCents}¢).` };
  }
  const today = todayMidnightUTC();
  const start = new Date(input.startDate);
  start.setUTCHours(0, 0, 0, 0);
  if (start < today) {
    return { kind: 'ValidationError', field: 'startDate', message: 'Start date cannot be in the past.' };
  }
  return null;
}

export function useCreateRecurringExpense(groupId: string) {
  const expenseRepo = useService(EXPENSE_REPO);
  const splitRepo   = useService(SPLIT_REPO);
  const reRepo      = useService(RECURRING_EXPENSE_REPO);
  const storeApi    = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const createRecurringExpense = useCallback(
    async (input: CreateRecurringExpenseInput): Promise<RecurringExpense | null> => {
      setError(null);

      const validationError = validate(input);
      if (validationError) { setError(validationError); return null; }

      setLoading(true);
      try {
        if (!input.skipFirstExpense) {
        const expenseId = generateId();
        const expResult = await expenseRepo.saveExpense({
          id:               expenseId,
          groupId,
          description:      input.description.trim(),
          totalAmountCents: input.totalAmountCents,
          currency:         input.currency,
          paidByUserId:     input.paidByUserId,
          createdAt:        new Date(),
          settledAt:        null,
          splits:           [],
          metadata:         {},
        });
        if (!isOk(expResult)) { setError(expResult.error); return null; }

        const splitResults = await Promise.all(
          input.splits.map(s =>
            splitRepo.saveSplit({
              id:              generateId(),
              expenseId,
              userId:          s.userId,
              amountOwedCents: s.amountOwedCents,
              amountPaidCents: 0,
            }),
          ),
        );
        const firstSplitErr = splitResults.find(r => !isOk(r));
        if (firstSplitErr && !isOk(firstSplitErr)) { setError(firstSplitErr.error); return null; }

        storeApi.getState().appendGroupExpense({
          ...expResult.value,
          splits: splitResults.filter(isOk).map(r => r.value),
        });
        } // end if (!skipFirstExpense)

        // nextDueAt is advanced one period so the cron doesn't double-spawn the first occurrence.
        const re: RecurringExpense = {
          id:               generateId(),
          groupId,
          description:      input.description.trim(),
          totalAmountCents: input.totalAmountCents,
          currency:         input.currency,
          paidByUserId:     input.paidByUserId,
          period:           input.period,
          startDate:        input.startDate,
          nextDueAt:        addPeriod(input.startDate, input.period),
          lastSpawnedAt:    null,
          pausedAt:         null,
          createdAt:        new Date(),
          createdByUserId:  input.createdByUserId,
          splits:           input.splits.map(s => ({
            id:                 generateId(),
            recurringExpenseId: '',  // filled in after we know the template id
            userId:             s.userId,
            amountOwedCents:    s.amountOwedCents,
          })),
        };
        // Patch in the correct recurringExpenseId now that we have re.id
        re.splits.forEach(s => { (s as { recurringExpenseId: string }).recurringExpenseId = re.id; });

        const reResult = await reRepo.saveRecurringExpense(re);
        if (!isOk(reResult)) { setError(reResult.error); return null; }

        storeApi.getState().appendRecurringExpense(reResult.value);
        return reResult.value;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [expenseRepo, splitRepo, reRepo, storeApi, groupId],
  );

  return { createRecurringExpense, loading, error };
}
