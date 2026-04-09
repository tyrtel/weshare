import { useState, useCallback } from 'react';
import { useContainer } from '../../../core/di/ServiceContext';
import type { Bill } from '../../../core/models/Bill';

export function useBills() {
  const storage = useContainer().resolve('storageService');
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await storage.getAllBills();
      setBills(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load bills.'));
    } finally {
      setLoading(false);
    }
  }, [storage]);

  const createBill = useCallback(
    async (data: Omit<Bill, 'id' | 'createdAt' | 'splits'>): Promise<Bill> => {
      const bill: Bill = {
        ...data,
        id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date(),
        splits: [],
      };
      await storage.saveBill(bill);
      setBills((prev) => [bill, ...prev]);
      return bill;
    },
    [storage],
  );

  const deleteBill = useCallback(
    async (billOrId: Bill | string) => {
      const id = typeof billOrId === 'string' ? billOrId : billOrId.id;
      await storage.deleteBill(id);
      setBills((prev) => prev.filter((b) => b.id !== id));
    },
    [storage],
  );

  return { bills, loading, error, fetchBills, createBill, deleteBill };
}
