import { useState, useMemo } from 'react';
import type { TripMember } from '../../../core/models/TripMember';
import type { ExpenseLineItem } from '../../../core/models/Expense';
import type { SplitMode } from '../components/SplitMemberRow';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';
import { generateId } from '../../../core/utils/generateId';
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
  initialLineItems?: ExpenseLineItem[];
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
  lineItems: ExpenseLineItem[];
  itemizedTotal: number;
  handleSetMode: (mode: SplitMode) => void;
  handleToggleMember: (userId: string) => void;
  handleChangeAmount: (userId: string, cents: number) => void;
  handleChangeWeight: (userId: string, bps: number) => void;
  getDisplayAmountFor: (userId: string) => number;
  addLineItem: () => void;
  updateLineItem: (id: string, changes: Partial<Pick<ExpenseLineItem, 'description' | 'amountCents'>>) => void;
  removeLineItem: (id: string) => void;
  clearLineItems: () => void;
  toggleMemberInItem: (itemId: string, userId: string) => void;
  initFromParsed: (parsedItems: ParsedReceiptLineItem[], allMembers: TripMember[]) => void;
  rescaleForCurrency: (scale: number) => void;
}

function computeItemizedSplits(items: ExpenseLineItem[]): SplitResult[] {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const n = item.assignedUserIds.length;
    if (n === 0) continue;
    const perUser    = Math.floor(item.amountCents / n);
    const remainder  = item.amountCents - perUser * n;
    item.assignedUserIds.forEach((uid, i) => {
      totals[uid] = (totals[uid] ?? 0) + perUser + (i === n - 1 ? remainder : 0);
    });
  }
  return Object.entries(totals).map(([userId, amountOwedCents]) => ({ userId, amountOwedCents }));
}

export function useSplitForm({
  members,
  totalAmountCents,
  initialEntries,
  initialMode = 'equal',
  initialLineItems,
  ready = members.length > 0,
}: UseSplitFormArgs): UseSplitFormReturn {
  const [splitMode, setSplitMode] = useState<SplitMode>(initialMode);
  const [splitEntries, setSplitEntries] = useState<SplitFormEntry[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [dirtyWeights, setDirtyWeights] = useState<Set<string>>(new Set());
  const [initialised, setInitialised] = useState(false);
  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>([]);

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
    if (initialLineItems !== undefined) setLineItems(initialLineItems);
    setInitialised(true);
  }

  const itemizedTotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.amountCents, 0),
    [lineItems],
  );

  const computedSplits = useMemo<SplitResult[]>(() => {
    if (splitMode === 'itemized') {
      return computeItemizedSplits(lineItems);
    }
    const included = splitEntries.filter(e => e.included);
    if (splitMode === 'proportional') {
      return computeProportionalSplits(included.map(e => e.userId), weights, totalAmountCents);
    }
    return computeSplitInputs(
      included.map(e => ({ userId: e.userId, customAmountCents: e.customAmountCents })),
      totalAmountCents,
    );
  }, [splitMode, lineItems, splitEntries, weights, totalAmountCents]);

  const remainder = splitMode === 'itemized'
    ? 0
    : totalAmountCents - computedSplits.reduce((s, e) => s + e.amountOwedCents, 0);

  const splitIsValid = splitMode === 'itemized'
    ? lineItems.length > 0 && lineItems.every(item => item.assignedUserIds.length > 0)
    : computedSplits.length > 0 && remainder === 0;

  const handleSetMode = (mode: SplitMode) => {
    setSplitMode(mode);
    if (mode !== 'custom' && mode !== 'itemized') {
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

  // ── Line item management ────────────────────────────────────────────────────

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      {
        id:              generateId(),
        description:     '',
        amountCents:     0,
        assignedUserIds: members.map(m => m.userId),
      },
    ]);
  };

  const updateLineItem = (
    id: string,
    changes: Partial<Pick<ExpenseLineItem, 'description' | 'amountCents'>>,
  ) => {
    setLineItems(prev => prev.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(item => item.id !== id));
  };

  const clearLineItems = () => setLineItems([]);

  const toggleMemberInItem = (itemId: string, userId: string) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const has = item.assignedUserIds.includes(userId);
      return {
        ...item,
        assignedUserIds: has
          ? item.assignedUserIds.filter(id => id !== userId)
          : [...item.assignedUserIds, userId],
      };
    }));
  };

  // Rescales any already-entered custom split amounts and line items when the
  // expense currency changes — e.g. switching from a 2-decimal currency (EUR)
  // to a 0-decimal one (JPY) means every previously-entered minor-unit amount
  // was computed against the wrong subunit size and is now off by 100x.
  const rescaleForCurrency = (scale: number) => {
    if (scale === 1) return;
    setSplitEntries(prev => prev.map(e =>
      e.customAmountCents != null ? { ...e, customAmountCents: Math.round(e.customAmountCents * scale) } : e,
    ));
    setLineItems(prev => prev.map(item => ({ ...item, amountCents: Math.round(item.amountCents * scale) })));
  };

  // Populates items from OCR output and switches to itemized mode.
  const initFromParsed = (parsedItems: ParsedReceiptLineItem[], allMembers: TripMember[]) => {
    const allIds = allMembers.map(m => m.userId);
    setLineItems(parsedItems.map(p => ({
      id:              generateId(),
      description:     p.description,
      amountCents:     p.amountCents,
      assignedUserIds: allIds,
    })));
    setSplitMode('itemized');
  };

  return {
    splitMode,
    splitEntries,
    weights,
    computedSplits,
    remainder,
    splitIsValid,
    lineItems,
    itemizedTotal,
    handleSetMode,
    handleToggleMember,
    handleChangeAmount,
    handleChangeWeight,
    getDisplayAmountFor,
    addLineItem,
    updateLineItem,
    removeLineItem,
    clearLineItems,
    toggleMemberInItem,
    initFromParsed,
    rescaleForCurrency,
  };
}
