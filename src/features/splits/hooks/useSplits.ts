import { useState, useCallback } from 'react';
import { useContainer } from '../../../core/di/ServiceContext';
import type { Split } from '../../../core/models/Split';
import type { Bill } from '../../../core/models/Bill';

export function useSplits() {
  const storage = useContainer().resolve('storageService');
  const [splits, setSplits] = useState<Split[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSplitsForBill = useCallback(
    async (billId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await storage.getSplitsForBill(billId);
        setSplits(result);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Failed to load splits.'));
      } finally {
        setLoading(false);
      }
    },
    [storage],
  );

  /**
   * Divides the bill total equally among all participants, saves each Split,
   * and returns the created records. Throws if the bill has no participants.
   */
  const calculateEqualSplits = useCallback(
    async (bill: Bill): Promise<Split[]> => {
      if (bill.participants.length === 0) {
        throw new Error('Cannot split: bill has no participants.');
      }

      // Round to cents to avoid floating-point drift.
      const rawPerPerson = bill.totalAmount / bill.participants.length;
      const perPerson = Math.round(rawPerPerson * 100) / 100;

      const newSplits: Split[] = bill.participants.map((participantId, index) => ({
        id: `split_${bill.id}_${index}_${Date.now()}`,
        billId: bill.id,
        participantId,
        amountOwed: perPerson,
        amountPaid: 0,
        settled: false,
      }));

      for (const split of newSplits) {
        await storage.saveSplit(split);
      }

      setSplits(newSplits);
      return newSplits;
    },
    [storage],
  );

  const markAsSettled = useCallback(
    async (splitId: string) => {
      const split = await storage.getSplit(splitId);
      if (!split) throw new Error(`Split "${splitId}" not found.`);

      const settled: Split = { ...split, amountPaid: split.amountOwed, settled: true };
      await storage.updateSplit(settled);
      setSplits((prev) => prev.map((s) => (s.id === splitId ? settled : s)));
    },
    [storage],
  );

  return { splits, loading, error, fetchSplitsForBill, calculateEqualSplits, markAsSettled };
}
