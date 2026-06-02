import { useState, useMemo } from 'react';
import type { TripMember } from '../../../core/models/TripMember';
import type { SplitMode } from '../components/SplitMemberRow';
import {
  computeSplitInputs,
  computeProportionalSplits,
  normaliseWeightsWithDirty,
  initialWeights,
  type SplitResult,
} from '../utils/splitCalculations';

export interface SplitFormEntry {
  userId: string;
  included: boolean;
  customAmountCents: number | null;
}

interface UseSplitFormArgs {
  members: TripMember[];
  totalAmountCents: number;
  initialEntries?: SplitFormEntry[];
  initialMode?: SplitMode;
  // Explicit ready gate. Defaults to members.length > 0 (sufficient for Add).
  // Pass ready={!!trip && !!expense} for Edit to delay init until both are loaded.
  ready?: boolean;
}

export interface UseSplitFormReturn {
  splitMode: SplitMode;
  splitEntries: SplitFormEntry[];
  weights: Record<string, number>;
  computedSplits: SplitResult[];
  remainder: number;
  splitIsValid: boolean;
  handleSetMode: (mode: SplitMode) => void;
  handleToggleMember: (userId: string) => void;
  handleChangeAmount: (userId: string, cents: number) => void;
  handleChangeWeight: (userId: string, bps: number) => void;
  getDisplayAmountFor: (userId: string) => number;
}

export function useSplitForm({
  members,
  totalAmountCents,
  initialEntries,
  initialMode = 'equal',
  ready = members.length > 0,
}: UseSplitFormArgs): UseSplitFormReturn {
  const [splitMode, setSplitMode] = useState<SplitMode>(initialMode);
  const [splitEntries, setSplitEntries] = useState<SplitFormEntry[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [dirtyWeights, setDirtyWeights] = useState<Set<string>>(new Set());
  const [initialised, setInitialised] = useState(false);

  // Render-phase init: fires once when data becomes available (same pattern as the screens).
  if (ready && !initialised) {
    if (initialEntries !== undefined) {
      setSplitEntries(initialEntries);
      setWeights(initialWeights(initialEntries.filter(e => e.included).map(e => e.userId)));
    } else {
      const ids = members.map(m => m.userId);
      setSplitEntries(ids.map(id => ({ userId: id, included: true, customAmountCents: null })));
      setWeights(initialWeights(ids));
    }
    if (initialMode !== 'equal') setSplitMode(initialMode);
    setInitialised(true);
  }

  const computedSplits = useMemo<SplitResult[]>(() => {
    const included = splitEntries.filter(e => e.included);
    if (splitMode === 'proportional') {
      return computeProportionalSplits(included.map(e => e.userId), weights, totalAmountCents);
    }
    return computeSplitInputs(
      included.map(e => ({ userId: e.userId, customAmountCents: e.customAmountCents })),
      totalAmountCents,
    );
  }, [splitMode, splitEntries, weights, totalAmountCents]);

  const remainder = totalAmountCents - computedSplits.reduce((s, e) => s + e.amountOwedCents, 0);

  const splitIsValid = computedSplits.length > 0 && remainder === 0;

  const handleSetMode = (mode: SplitMode) => {
    setSplitMode(mode);
    if (mode !== 'custom') {
      setSplitEntries(prev => prev.map(e => ({ ...e, customAmountCents: null })));
    }
    if (mode === 'proportional') {
      const includedIds = splitEntries.filter(e => e.included).map(e => e.userId);
      setWeights(initialWeights(includedIds));
      setDirtyWeights(new Set());
    }
  };

  const handleToggleMember = (userId: string) => {
    setSplitEntries(prev => {
      const next = prev.map(e =>
        e.userId === userId ? { ...e, included: !e.included, customAmountCents: null } : e,
      );
      if (splitMode === 'proportional') {
        const includedIds = next.filter(e => e.included).map(e => e.userId);
        setWeights(initialWeights(includedIds));
        setDirtyWeights(new Set());
      }
      return next;
    });
  };

  const handleChangeAmount = (userId: string, cents: number) => {
    setSplitEntries(prev =>
      prev.map(e => e.userId === userId ? { ...e, customAmountCents: cents } : e),
    );
  };

  const handleChangeWeight = (userId: string, bps: number) => {
    const newDirty = new Set([...dirtyWeights, userId]);
    setDirtyWeights(newDirty);
    setWeights(prev => {
      const includedIds = splitEntries.filter(e => e.included).map(e => e.userId);
      return normaliseWeightsWithDirty(prev, userId, bps, includedIds, newDirty);
    });
  };

  const getDisplayAmountFor = (userId: string): number => {
    const entry   = splitEntries.find(e => e.userId === userId);
    if (!entry) return 0;
    const computed = computedSplits.find(s => s.userId === userId);
    return splitMode === 'proportional'
      ? (computed?.amountOwedCents ?? 0)
      : entry.customAmountCents !== null
        ? entry.customAmountCents
        : (computed?.amountOwedCents ?? 0);
  };

  return {
    splitMode,
    splitEntries,
    weights,
    computedSplits,
    remainder,
    splitIsValid,
    handleSetMode,
    handleToggleMember,
    handleChangeAmount,
    handleChangeWeight,
    getDisplayAmountFor,
  };
}
