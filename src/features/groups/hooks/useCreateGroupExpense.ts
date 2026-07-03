import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, SPLIT_REPO, TRIP_STORE, NOTIFICATION_SERVICE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { generateId } from '../../../core/utils/generateId';
import type { Expense } from '../../../core/models/Expense';
import type { AppError } from '../../../core/types/AppError';
import type { AddExpenseInput } from '../../expenses/hooks/useAddExpense';

export type { AddExpenseInput as GroupExpenseInput };

function validate(input: AddExpenseInput): AppError | null {
  if (!input.description.trim()) {
    return { kind: 'ValidationError', field: 'description', message: 'Description is required.' };
  }
  if (!Number.isInteger(input.totalAmountCents) || input.totalAmountCents <= 0) {
    return { kind: 'ValidationError', field: 'totalAmount', message: 'Amount must be a positive integer number of cents.' };
  }
  if (!input.paidByUserId) {
    return { kind: 'ValidationError', field: 'paidByUserId', message: 'Payer is required.' };
  }
  if (input.splits.length === 0) {
    return { kind: 'ValidationError', field: 'splits', message: 'At least one person must share the expense.' };
  }
  const splitTotal = input.splits.reduce((s, sp) => s + sp.amountOwedCents, 0);
  if (splitTotal !== input.totalAmountCents) {
    return { kind: 'ValidationError', field: 'splits', message: `Split total (${splitTotal}¢) must equal expense total (${input.totalAmountCents}¢).` };
  }
  return null;
}

export function useCreateGroupExpense(groupId: string) {
  const expenseRepo         = useService(EXPENSE_REPO);
  const splitRepo           = useService(SPLIT_REPO);
  const storeApi            = useService(TRIP_STORE);
  const notificationService = useService(NOTIFICATION_SERVICE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const createGroupExpense = useCallback(
    async (input: AddExpenseInput): Promise<Expense | null> => {
      setError(null);

      const validationError = validate(input);
      if (validationError) { setError(validationError); return null; }

      setLoading(true);
      try {
        const expenseId = generateId();
        const expense: Expense = {
          id:               expenseId,
          groupId,
          description:      input.description.trim(),
          totalAmountCents: input.totalAmountCents,
          currency:         input.currency,
          paidByUserId:     input.paidByUserId,
          createdAt:        new Date(),
          settledAt:        null,
          splits:           [],
          metadata: {
            category:       input.category,
            receiptUrl:     input.receiptUrl,
            lineItems:      input.lineItems,
            originalAmount: input.originalAmount,
          },
        };

        const expResult = await expenseRepo.saveExpense(expense);
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

        const firstError = splitResults.find(r => !isOk(r));
        if (firstError && !isOk(firstError)) { setError(firstError.error); return null; }

        const saved: Expense = {
          ...expResult.value,
          splits: splitResults.filter(isOk).map(r => r.value),
        };

        storeApi.getState().appendGroupExpense(saved);

        // Fire-and-forget: notify every group member except the payer.
        // Notification failures must never block or fail the expense creation.
        const group  = storeApi.getState().groups.find(g => g.id === groupId);
        const payer  = group?.members.find(m => m.userId === saved.paidByUserId);
        const amount = (saved.totalAmountCents / 100).toFixed(2);
        for (const member of (group?.members ?? [])) {
          if (member.userId === saved.paidByUserId) continue;
          notificationService.enqueue({
            userId:    member.userId,
            channel:   'push',
            eventType: 'expense_added',
            payload: {
              userId: member.userId,
              title:  group?.name ?? 'WeShare',
              body:   `${payer?.displayName ?? 'Someone'} added "${saved.description}" (${saved.currency} ${amount})`,
            },
          }).catch(() => {});
        }

        return saved;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [expenseRepo, splitRepo, storeApi, notificationService, groupId],
  );

  return { createGroupExpense, loading, error };
}
