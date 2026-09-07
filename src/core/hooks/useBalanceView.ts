import { create } from 'zustand';

export type BalanceViewMode = 'bars' | 'list';

const VALID_MODES = new Set<string>(['bars', 'list']);
const DEFAULT: BalanceViewMode = 'bars';
const guard = (m: string): BalanceViewMode => (VALID_MODES.has(m) ? (m as BalanceViewMode) : DEFAULT);

interface BalanceViewStore {
  group: BalanceViewMode;
  trip: BalanceViewMode;
  setGroup: (mode: BalanceViewMode) => void;
  setTrip: (mode: BalanceViewMode) => void;
}

export const useBalanceView = create<BalanceViewStore>(set => ({
  group: DEFAULT,
  trip: DEFAULT,
  setGroup: (mode) => set({ group: guard(mode) }),
  setTrip: (mode) => set({ trip: guard(mode) }),
}));
